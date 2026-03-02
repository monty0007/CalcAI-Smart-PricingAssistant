import os
import sys
import json
import time
import requests
import psycopg2
from psycopg2 import extras
from datetime import datetime
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from dotenv import load_dotenv

# Load .env from one level up
load_dotenv(os.path.join(os.path.dirname(__file__), '../.env'))

# Configuration
API_URL = "https://prices.azure.com/api/retail/prices"
BATCH_SIZE = 1000
CURRENCIES = ['USD']
CHECKPOINT_FILE = "checkpoint.json"

# Setup Request Session with Retries
session = requests.Session()
retry_strategy = Retry(
    total=10,
    backoff_factor=2,
    status_forcelist=[429, 500, 502, 503, 504],
)
adapter = HTTPAdapter(max_retries=retry_strategy)
session.mount("https://", adapter)
session.mount("http://", adapter)

# ── DB Connection ─────────────────────────────────────────────────────────────

def get_db_connection():
    db_url = os.environ.get('DATABASE_URL')
    print("db_url",db_url)
    if not db_url:
        print("Error: DATABASE_URL not found in .env")
        sys.exit(1)
    return psycopg2.connect(db_url)

# ── Schema ────────────────────────────────────────────────────────────────────

def init_schema(conn):
    print("Initializing Database Schema...")
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS azure_prices (
            id BIGSERIAL PRIMARY KEY,
            meter_id TEXT,
            sku_id TEXT,
            service_name TEXT,
            service_id TEXT,
            service_family TEXT,
            product_name TEXT,
            sku_name TEXT,
            arm_region_name TEXT,
            location TEXT,
            currency_code TEXT,
            retail_price DOUBLE PRECISION,
            unit_price DOUBLE PRECISION,
            effective_start_date TIMESTAMP,
            type TEXT,
            reservation_term TEXT,
            raw_data JSONB,
            is_active BOOLEAN DEFAULT TRUE,
            last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)

    cur.execute("DROP INDEX IF EXISTS idx_prices_unique_key")

    cur.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_prices_unique_key
        ON azure_prices(meter_id, sku_id, currency_code, effective_start_date, arm_region_name)
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_prices_service_region
        ON azure_prices(service_name, arm_region_name)
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_prices_sku_name
        ON azure_prices(sku_name)
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_prices_currency
        ON azure_prices(currency_code)
    """)

    conn.commit()
    cur.close()
    print("Schema ready.")

# ── Checkpoint ────────────────────────────────────────────────────────────────

def load_checkpoint():
    if os.path.exists(CHECKPOINT_FILE):
        try:
            with open(CHECKPOINT_FILE, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Warning: Could not load checkpoint: {e}")
    return None

def save_checkpoint(currency, url, total_fetched):
    try:
        with open(CHECKPOINT_FILE, 'w') as f:
            json.dump({
                'currency': currency,
                'url': url,
                'total_fetched': total_fetched,
                'timestamp': datetime.now().isoformat()
            }, f)
    except Exception as e:
        print(f"\nWarning: Failed to save checkpoint: {e}")

def clear_checkpoint():
    if os.path.exists(CHECKPOINT_FILE):
        try:
            os.remove(CHECKPOINT_FILE)
        except Exception:
            pass

# ── Batch Insert with Retry ───────────────────────────────────────────────────

def insert_batch(conn, items, retries=3):
    if not items:
        return

    values = []
    for item in items:
        values.append((
            item.get('meterId'), item.get('skuId'), item.get('serviceName'),
            item.get('serviceId'), item.get('serviceFamily'), item.get('productName'),
            item.get('skuName'), item.get('armRegionName'), item.get('location'),
            item.get('currencyCode'), item.get('retailPrice'), item.get('unitPrice'),
            item.get('effectiveStartDate'), item.get('type'), item.get('reservationTerm'),
            json.dumps(item)
        ))

    query = """
    INSERT INTO azure_prices (
        meter_id, sku_id, service_name, service_id, service_family,
        product_name, sku_name, arm_region_name, location,
        currency_code, retail_price, unit_price, effective_start_date,
        type, reservation_term, raw_data
    ) VALUES %s
    ON CONFLICT (meter_id, sku_id, currency_code, effective_start_date, arm_region_name)
    DO NOTHING
    """

    for attempt in range(1, retries + 1):
        cur = conn.cursor()
        try:
            extras.execute_values(
                cur, query, values,
                template="(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
            )
            conn.commit()
            cur.close()
            return
        except Exception as e:
            conn.rollback()
            cur.close()
            print(f"\nBatch insert attempt {attempt}/{retries} failed: {e}")
            if attempt < retries:
                time.sleep(2 ** attempt)
            else:
                print(f"\n❌ CRITICAL: Batch permanently failed after {retries} attempts. {len(items)} rows lost.")

# ── Main Fetch & Load ─────────────────────────────────────────────────────────

def fetch_and_load(fresh=False):
    conn = get_db_connection()

    if fresh:
        cur = conn.cursor()
        print("--- FRESH START: Clearing existing data ---")
        cur.execute("TRUNCATE TABLE azure_prices RESTART IDENTITY")
        conn.commit()
        cur.close()
        clear_checkpoint()

    init_schema(conn)
    checkpoint = load_checkpoint()

    start_currency_idx = 0
    if checkpoint:
        print(f"Resuming {checkpoint['currency']} from page link...")
        try:
            start_currency_idx = CURRENCIES.index(checkpoint['currency'])
        except ValueError:
            start_currency_idx = 0

    for i in range(start_currency_idx, len(CURRENCIES)):
        currency = CURRENCIES[i]

        url = API_URL + f"?currencyCode={currency}"
        total_fetched = 0

        if checkpoint and checkpoint['currency'] == currency:
            url = checkpoint['url']
            total_fetched = checkpoint['total_fetched']
            checkpoint = None

        if not url:
            print(f"Finished {currency} or no URL.")
            continue

        print(f"\n--- Processing {currency} ---")
        batch_items = []
        page_count = 0

        try:
            while url:
                try:
                    response = session.get(url, timeout=30)
                    response.raise_for_status()
                except Exception as e:
                    print(f"\nRequest failed: {e}. Retrying in 5s...")
                    time.sleep(5)
                    continue

                data = response.json()
                items = data.get('Items', [])

                if not items and not data.get('NextPageLink'):
                    break

                batch_items.extend(items)
                total_fetched += len(items)
                next_url = data.get('NextPageLink')

                if len(batch_items) >= BATCH_SIZE:
                    insert_batch(conn, batch_items)
                    batch_items = []
                    save_checkpoint(currency, next_url, total_fetched)

                url = next_url
                page_count += 1
                sys.stdout.write(f"\rPage: {page_count} | Total {currency} Fetched: {total_fetched}")
                sys.stdout.flush()

            if batch_items:
                insert_batch(conn, batch_items)

            print(f"\n✅ Finished {currency}. Total fetched: {total_fetched}")
            clear_checkpoint()

        except KeyboardInterrupt:
            print("\nPaused by user. Checkpoint saved.")
            save_checkpoint(currency, url, total_fetched)
            break
        except Exception as e:
            print(f"\nCritical error during {currency}: {e}")
            import traceback
            traceback.print_exc()
            save_checkpoint(currency, url, total_fetched)
            break

    conn.close()


if __name__ == "__main__":
    fresh_start = "--fresh" in sys.argv
    fetch_and_load(fresh=fresh_start)