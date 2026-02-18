
import os
import sys
import json
import time
import requests
import psycopg2
from psycopg2 import sql, extras
from datetime import datetime, timedelta
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import urllib.parse

# Configuration
API_URL = "https://prices.azure.com/api/retail/prices"
BATCH_SIZE = 1000
CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'AUD', 'CAD'] # Priority currencies for daily sync

# Setup Request Session with Retries
session = requests.Session()
retry_strategy = Retry(
    total=5,
    backoff_factor=1,
    status_forcelist=[429, 500, 502, 503, 504],
)
adapter = HTTPAdapter(max_retries=retry_strategy)
session.mount("https://", adapter)

def get_db_connection():
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        try:
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

def get_latest_effective_date(conn, currency):
    cur = conn.cursor()
    cur.execute("SELECT MAX(effective_start_date) FROM azure_prices WHERE currency_code = %s", (currency,))
    res = cur.fetchone()
    cur.close()
    return res[0] if res and res[0] else None

def daily_sync():
    conn = get_db_connection()
    print(f"--- Starting Daily Sync at {datetime.now()} ---")
    
    for currency in CURRENCIES:
        print(f"\nChecking {currency}...")
        latest_date = get_latest_effective_date(conn, currency)
        
        # If we have data, filter by date. To be safe, look back 2 days.
        filter_str = ""
        if latest_date:
            # Azure API filter: effectiveStartDate ge '2023-01-01T00:00:00Z'
            # We use 1 day buffer to catch any late-arriving data
            lookback_date = (latest_date - timedelta(days=1)).strftime('%Y-%m-%dT%H:%M:%SZ')
            filter_str = f"effectiveStartDate ge '{lookback_date}'"
            print(f"Filtering for items >= {lookback_date}")

        url = f"{API_URL}?currencyCode={currency}"
        if filter_str:
            url += f"&$filter={urllib.parse.quote(filter_str)}"

        total_fetched = 0
        total_inserted = 0
        page_count = 0
        
        while url:
            try:
                response = session.get(url, timeout=30)
                response.raise_for_status()
                data = response.json()
                items = data.get('Items', [])
                
                if not items:
                    break
                
                inserted = insert_batch(conn, items)
                total_fetched += len(items)
                total_inserted += inserted
                
                url = data.get('NextPageLink')
                page_count += 1
                sys.stdout.write(f"\rPage: {page_count} | Fetched: {total_fetched} | New/Updated: {total_inserted}")
                sys.stdout.flush()
                
                # If we've fetched more than 50k items in incremental mode, something might be wrong or it's a huge update
                # but we'll let it finish for consistency.
                
            except Exception as e:
                print(f"\nError fetching page: {e}")
                break
        
        print(f"\nFinished {currency}. Added/Updated: {total_inserted}")

    conn.close()
    print(f"\n--- Daily Sync Complete at {datetime.now()} ---")

def insert_batch(conn, items):
    if not items: return 0
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
        type, reservation_term, raw_data, last_seen_at
    ) VALUES %s
    ON CONFLICT (meter_id, sku_id, currency_code, effective_start_date) 
    DO UPDATE SET 
        retail_price = EXCLUDED.retail_price,
        unit_price = EXCLUDED.unit_price,
        last_seen_at = NOW()
    WHERE azure_prices.retail_price != EXCLUDED.retail_price
       OR azure_prices.unit_price != EXCLUDED.unit_price;
    """
    
    try:
        extras.execute_values(cur, query, values, template="(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())")
        conn.commit()
        # Rowcount doesn't work well with execute_values for total inserts/updates sometimes
        # but it gives an idea.
        count = cur.rowcount
        cur.close()
        return count
    except Exception as e:
        print(f"\nBatch insert failed: {e}")
        conn.rollback()
        cur.close()
        return 0

if __name__ == "__main__":
    daily_sync()
