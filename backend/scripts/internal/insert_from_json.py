import os
import sys
import json
import time
import psycopg2
from psycopg2 import sql, extras
from datetime import datetime

# Configuration
INPUT_FILE = "azure_pricing_dump.json"
BATCH_SIZE = 1000

# DB Connection
def get_db_connection():
    try:
        # Load from .env manually if needed
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
            print("Error: DATABASE_URL not found in environment or .env file")
            sys.exit(1)

        conn = psycopg2.connect(os.environ['DATABASE_URL'])
        return conn
    except Exception as e:
        print(f"Error connecting to database: {e}")
        sys.exit(1)

def ensure_schema(conn):
    """
    Ensures the table exists with the correct schema, but DOES NOT drop it.
    This allows for resuming or offline loading without data loss.
    """
    print("Verifying Database Schema...")
    cur = conn.cursor()
    
    schema_sql = """
    CREATE TABLE IF NOT EXISTS azure_prices (
        meter_id TEXT,
        sku_id TEXT,
        
        -- Core fields for filtering
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
        
        -- Full raw data
        raw_data JSONB,
        
        -- Metadata
        is_active BOOLEAN DEFAULT TRUE,
        last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        PRIMARY KEY (meter_id, effective_start_date)
    );

    CREATE INDEX IF NOT EXISTS idx_prices_service_region ON azure_prices(service_name, arm_region_name);
    CREATE INDEX IF NOT EXISTS idx_prices_sku_name ON azure_prices(sku_name);
    CREATE INDEX IF NOT EXISTS idx_prices_product_name ON azure_prices(product_name);
    CREATE INDEX IF NOT EXISTS idx_prices_active ON azure_prices(is_active);
    """
    cur.execute(schema_sql)
    conn.commit()
    cur.close()
    print("Schema verified.")

def insert_batch(conn, items, stats):
    if not items:
        return

    # Deduplicate items by (meterId, effectiveStartDate)
    unique_map = {}
    for item in items:
        key = (item.get('meterId'), item.get('effectiveStartDate'))
        if key[0] and key[1]:
            unique_map[key] = item
    
    # Sort for deadlock prevention
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
        raw_data = EXCLUDED.raw_data,
        is_active = TRUE,
        last_seen_at = NOW()
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
            conn.commit()
            stats['processed_items'] += len(deduped_items)
            break
        except psycopg2.errors.DeadlockDetected:
            conn.rollback()
            if attempt < max_retries - 1:
                print(f"\n⚠️ Deadlock detected. Retrying batch (Attempt {attempt+1}/{max_retries})...")
                time.sleep(1)
            else:
                print(f"\n❌ Batch Failed after retries.")
        except Exception as e:
            print(f"\n❌ Batch Failed: {e}")
            conn.rollback()
            break
            
    cur.close()

def load_from_json():
    # Check for CLI arg or default
    file_path = INPUT_FILE
    if len(sys.argv) > 1:
        file_path = sys.argv[1]

    if not os.path.exists(file_path):
        print(f"❌ Input file not found: {file_path}")
        print("Usage: python insert_from_json.py [file_path]")
        return

    conn = get_db_connection()
    ensure_schema(conn)

    print(f"📂 Reading {file_path}...")
    start_time = datetime.now()
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            # Note: Loading entire JSON into memory. 
            # If file is >1GB, verify system RAM or switch to streaming (ijson).
            data = json.load(f)
            
        items = data if isinstance(data, list) else data.get('Items', [])
        total_items = len(items)
        print(f"📦 Found {total_items} items. Starting ingestion...")

        stats = {'processed_items': 0}
        batch = []
        
        for i, item in enumerate(items):
            batch.append(item)
            
            if len(batch) >= BATCH_SIZE:
                insert_batch(conn, batch, stats)
                batch = []
                # Progress
                sys.stdout.write(f"\r🚀 Processed: {stats['processed_items']}/{total_items} ({(stats['processed_items']/total_items)*100:.1f}%)")
                sys.stdout.flush()
        
        if batch:
            insert_batch(conn, batch, stats)

        print(f"\n\n✅ Load complete! Processed {stats['processed_items']} items.")
        print(f"⏱️ Time taken: {datetime.now() - start_time}")

    except Exception as e:
        print(f"\n❌ Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    load_from_json()
