import os
import sys
import json
import time
import requests
import psycopg2
from psycopg2 import sql, extras
from datetime import datetime

# Configuration
API_URL = "https://prices.azure.com/api/retail/prices"
# Fetch only base USD prices for canonical database updates
API_FILTER = "currencyCode eq 'USD'"
BATCH_SIZE = 1000

# SKU to use for rate comparison 
REFERENCE_SKU = "Standard_D2s_v5" 
REFERENCE_REGION = "southcentralus" 

def get_db_connection():
    try:
        if not os.environ.get('DATABASE_URL'):
            try:
                base_dir = os.path.dirname(__file__)
                env_path = os.path.join(base_dir, '../.env')
                with open(env_path, 'r') as f:
                    for line in f:
                        if line.startswith('DATABASE_URL='):
                            os.environ['DATABASE_URL'] = line.strip().split('=', 1)[1]
            except Exception:
                pass

        if not os.environ.get('DATABASE_URL'):
            print("Error: DATABASE_URL not found.")
            sys.exit(1)

        conn = psycopg2.connect(os.environ['DATABASE_URL'])
        return conn
    except Exception as e:
        print(f"Error connecting to database: {e}")
        sys.exit(1)

def update_prices():
    conn = get_db_connection()
    
    start_time = datetime.now()
    print(f"[{start_time}] Starting Incremental Prices Update...")
    print("Fetching base USD prices from Azure API.")

    url = f"{API_URL}?$filter={API_FILTER}"

    stats = {
        "fetched": 0,
        "processed_batches": 0,
        "total_affected": 0, # Inserts + Updates
        "total_skipped": 0   # Unchanged
    }
    
    batch_items = []
    page_count = 0

    try:
        while url:
            try:
                response = requests.get(url, timeout=30)
                if response.status_code != 200:
                    print(f"API Error: {response.status_code} - {response.text}")
                    break
                
                data = response.json()
                items = data.get('Items', [])
            except Exception as e:
                print(f"Request failed: {e}")
                time.sleep(5) # Retry delay
                continue
            
            if not items:
                break
                
            batch_items.extend(items)
            stats["fetched"] += len(items)
            
            if len(batch_items) >= BATCH_SIZE:
                process_batch(conn, batch_items, stats)
                batch_items = []
                
            url = data.get('NextPageLink')
            page_count += 1
            sys.stdout.write(f"\rPage: {page_count} | Fetched: {stats['fetched']} | Changed: {stats['total_affected']} | Skipped: {stats['total_skipped']}")
            sys.stdout.flush()

        if batch_items:
            process_batch(conn, batch_items, stats)
            
        print(f"\n\nBase Prices Update Summary:")
        print(f"  Total Fetched: {stats['fetched']}")
        print(f"  Total Changed (Inserted/Updated): {stats['total_affected']}")
        print(f"  Total Skipped (Unchanged): {stats['total_skipped']}")
        
    except KeyboardInterrupt:
        print("\nStopped by user.")
    except Exception as e:
        print(f"\nUnexpected error: {e}")
    finally:
        conn.close()

def process_batch(conn, items, stats):
    if not items:
        return

    # Deduplicate by (meterId, effectiveStartDate)
    unique_map = {}
    for item in items:
        # Force currency to USD just to be safe
        item['currencyCode'] = 'USD'
        key = (item.get('meterId'), item.get('effectiveStartDate'))
        if key[0] and key[1]:
            unique_map[key] = item
    
    deduped_items = sorted(list(unique_map.values()), key=lambda x: (x.get('meterId', ''), x.get('effectiveStartDate', '')))
    
    if not deduped_items:
        return

    cur = conn.cursor()
    
    values = []
    for item in deduped_items:
        values.append((
            item.get('meterId'),
            item.get('skuId'),
            item.get('serviceName'),
            item.get('serviceId'),
            item.get('serviceFamily'),
            item.get('productName'),
            item.get('skuName'),
            item.get('armRegionName'),
            item.get('location'),
            item.get('currencyCode'),
            item.get('retailPrice'),
            item.get('unitPrice'),
            item.get('effectiveStartDate'),
            item.get('type'),
            item.get('reservationTerm'),
            json.dumps(item)
        ))

    # UPSERT with conditional update
    query = """
    INSERT INTO azure_prices (
        meter_id, sku_id, service_name, service_id, service_family,
        product_name, sku_name, arm_region_name, location,
        currency_code, retail_price, unit_price, effective_start_date,
        type, reservation_term, raw_data, 
        is_active, last_seen_at
    ) VALUES %s
    ON CONFLICT (meter_id, effective_start_date) DO UPDATE SET
        retail_price = EXCLUDED.retail_price,
        unit_price = EXCLUDED.unit_price,
        effective_start_date = EXCLUDED.effective_start_date,
        raw_data = EXCLUDED.raw_data,
        is_active = TRUE,
        last_seen_at = NOW()
    WHERE 
        azure_prices.retail_price IS DISTINCT FROM EXCLUDED.retail_price OR
        azure_prices.unit_price IS DISTINCT FROM EXCLUDED.unit_price OR
        azure_prices.is_active = FALSE
    """
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            extras.execute_values(
                cur, 
                query, 
                values, 
                template="(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE, NOW())",
                page_size=BATCH_SIZE
            )
            affected = cur.rowcount
            conn.commit()
            
            skipped = len(deduped_items) - affected
            stats["total_affected"] += affected
            stats["total_skipped"] += skipped
            stats["processed_batches"] += 1
            break
            
        except psycopg2.errors.DeadlockDetected:
            conn.rollback()
            if attempt < max_retries - 1:
                time.sleep(1)
            else:
                print(f"\n❌ Batch Update Failed (Deadlock).")
        except Exception as e:
            conn.rollback()
            break
    
    cur.close()

if __name__ == "__main__":
    update_prices()
