import os
import sys
import json
import time
import requests
import psycopg2
from psycopg2 import sql, extras
from datetime import datetime
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Configuration
API_URL = "https://prices.azure.com/api/retail/prices"
BATCH_SIZE = 1000
# UPDATED: Restricted to USD only for base canonical pricing
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

# DB Connection
def get_db_connection():
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        try:
            # Look in parent dir .env
            env_path = os.path.join(os.path.dirname(__file__), '../.env')
            if os.path.exists(env_path):
                with open(env_path, 'r') as f:
                    for line in f:
                        if line.strip().startswith('DATABASE_URL='):
                            db_url = line.strip().split('=', 1)[1]
                            break
        except Exception: pass
    
    if not db_url:
        print("Error: DATABASE_URL not found.")
        sys.exit(1)
    return psycopg2.connect(db_url)

def init_schema(conn):
    print("Initializing Database Schema...")
    cur = conn.cursor()
    schema_sql = """
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
    );

    -- Unique constraint for deduplication
    CREATE UNIQUE INDEX IF NOT EXISTS idx_prices_unique_key 
    ON azure_prices(meter_id, sku_id, currency_code, effective_start_date);

    CREATE INDEX IF NOT EXISTS idx_prices_service_region ON azure_prices(service_name, arm_region_name);
    CREATE INDEX IF NOT EXISTS idx_prices_sku_name ON azure_prices(sku_name);
    CREATE INDEX IF NOT EXISTS idx_prices_currency ON azure_prices(currency_code);
    """
    cur.execute(schema_sql)
    conn.commit()
    cur.close()
    print("Schema ready.")

def load_checkpoint():
    if os.path.exists(CHECKPOINT_FILE):
        try:
            with open(CHECKPOINT_FILE, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Warning: Could not load checkpoint: {e}")
    return None

def save_checkpoint(currency, url, total_fetched):
    # Use a temporary file and rename to avoid locking/corruption issues on Windows
    temp_file = CHECKPOINT_FILE + ".tmp"
    try:
        with open(temp_file, 'w') as f:
            json.dump({
                'currency': currency,
                'url': url,
                'total_fetched': total_fetched,
                'timestamp': datetime.now().isoformat()
            }, f)
        if os.path.exists(CHECKPOINT_FILE):
            os.remove(CHECKPOINT_FILE)
        os.rename(temp_file, CHECKPOINT_FILE)
    except Exception as e:
        print(f"\nWarning: Failed to save checkpoint: {e}")

def fetch_and_load(fresh=False):
    conn = get_db_connection()
    
    if fresh:
        cur = conn.cursor()
        print("--- FRESH START: Dropping existing data ---")
        cur.execute("DROP TABLE IF EXISTS azure_prices;")
        conn.commit()
        cur.close()
        if os.path.exists(CHECKPOINT_FILE):
            try: os.remove(CHECKPOINT_FILE)
            except: pass

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
        
        # Determine starting URL
        url = API_URL + f"?currencyCode='{currency}'"
        total_fetched = 0
        
        if checkpoint and checkpoint['currency'] == currency:
            url = checkpoint['url']
            total_fetched = checkpoint['total_fetched']
            # Clear checkpoint variable after first use
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
                
                if len(batch_items) >= BATCH_SIZE:
                    insert_batch(conn, batch_items)
                    batch_items = []
                    save_checkpoint(currency, data.get('NextPageLink'), total_fetched)
                    
                url = data.get('NextPageLink')
                page_count += 1
                sys.stdout.write(f"\rPage: {page_count} | Total {currency} Fetched: {total_fetched}")
                sys.stdout.flush()

            if batch_items:
                insert_batch(conn, batch_items)
                
            print(f"\n✅ Finished {currency}. Total: {total_fetched}")
            # Clear checkpoint for this currency
            if os.path.exists(CHECKPOINT_FILE):
                try: os.remove(CHECKPOINT_FILE)
                except: pass

        except KeyboardInterrupt:
            print("\nPaused by user. Checkpoint saved.")
            break
        except Exception as e:
            print(f"\nCritical error during {currency}: {e}")
            import traceback
            traceback.print_exc()
            break

    conn.close()

def insert_batch(conn, items):
    if not items: return
    cur = conn.cursor()
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
    ON CONFLICT (meter_id, sku_id, currency_code, effective_start_date) DO NOTHING
    """
    try:
        extras.execute_values(cur, query, values, template="(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)")
        conn.commit()
    except Exception as e:
        print(f"\nBatch insert failed: {e}")
        conn.rollback()
    finally:
        cur.close()

if __name__ == "__main__":
    fresh_start = "--fresh" in sys.argv
    fetch_and_load(fresh=fresh_start)