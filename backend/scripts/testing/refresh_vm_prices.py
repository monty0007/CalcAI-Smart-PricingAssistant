import requests
import psycopg2
import os
import sys
import time
from datetime import datetime
import urllib.parse

# Configuration
API_URL = "https://prices.azure.com/api/retail/prices"
BATCH_SIZE = 1000

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
        return psycopg2.connect(os.environ['DATABASE_URL'])
    except Exception as e:
        print(f"Error connecting to database: {e}")
        sys.exit(1)

def refresh_vm_prices():
    conn = get_db_connection()
    cur = conn.cursor()

    print("--- Refreshing Virtual Machines Prices ---")
    
    # 1. DELETE existing VM prices
    print("Deleting existing 'Virtual Machines' data...")
    cur.execute("DELETE FROM azure_prices WHERE service_name = 'Virtual Machines'")
    conn.commit()
    print("Deleted.")

    # 2. Fetch new data
    # Filter for Virtual Machines AND Consumption (to prioritize relevant data)
    # We can fetch everything for VMs, but Consumption is most important for the calculator
    # Let's fetch ALL types for Virtual Machines to be safe
    filters = "serviceName eq 'Virtual Machines'"
    url = f"{API_URL}?currencyCode=USD&$filter={urllib.parse.quote(filters)}"
    
    total_inserted = 0
    page_count = 0
    
    print(f"Fetching from: {url}")
    
    while url:
        try:
            response = requests.get(url)
            if response.status_code != 200:
                print(f"❌ Error: Status {response.status_code}")
                time.sleep(5)
                continue
            
            data = response.json()
            items = data.get('Items', [])
            
            if not items:
                break
            
            # Prepare batch insert
            args_list = []
            for item in items:
                args_list.append((
                   item.get('currencyCode'),
                   item.get('tierMinimumUnits'),
                   item.get('retailPrice'),
                   item.get('unitPrice'),
                   item.get('armRegionName'),
                   item.get('location'),
                   item.get('effectiveStartDate'),
                   item.get('meterId'),
                   item.get('meterName'),
                   item.get('productId'),
                   item.get('skuId'),
                   item.get('productName'),
                   item.get('skuName'),
                   item.get('serviceName'),
                   item.get('serviceId'),
                   item.get('serviceFamily'),
                   item.get('unitOfMeasure'),
                   item.get('type'),
                   item.get('isPrimaryMeterRegion'),
                   item.get('armSkuName')
                ))

            # Bulk Insert
            query = """
                INSERT INTO azure_prices (
                    currency_code, tier_minimum_units, retail_price, unit_price,
                    arm_region_name, location, effective_start_date, meter_id,
                    meter_name, product_id, sku_id, product_name, sku_name,
                    service_name, service_id, service_family, unit_of_measure,
                    type, is_primary_meter_region, arm_sku_name
                ) VALUES %s
            """
            
            from psycopg2.extras import execute_values
            execute_values(cur, query, args_list)
            conn.commit()
            
            total_inserted += len(items)
            page_count += 1
            print(f"Page {page_count}: Inserted {len(items)} items. Total: {total_inserted}")
            
            url = data.get('NextPageLink')
            
            # Optional: formatting or limiting logic if needed?
            # No, let's fetch ALL VMs this time. It takes time but user needs it.
            
        except Exception as e:
            print(f"❌ Exception: {e}")
            break

    print(f"\n✅ Refresh Complete. Total Inserted: {total_inserted}")
    cur.close()
    conn.close()

if __name__ == "__main__":
    refresh_vm_prices()
