
import os
import sys
import json
import requests
import psycopg2
from psycopg2.extras import execute_values
from datetime import datetime

# DB Connection
def get_db_connection():
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        try:
            # Look in current dir or parent dir .env
            env_paths = ['.env', '../.env', 'backend/.env']
            for path in env_paths:
                if os.path.exists(path):
                    with open(path, 'r') as f:
                        for line in f:
                            if line.strip().startswith('DATABASE_URL='):
                                db_url = line.strip().split('=', 1)[1]
                                break
                    if db_url: break
        except Exception as e:
            print(f"Warning loading .env: {e}")

    if not db_url:
        print("Error: DATABASE_URL not found.")
        sys.exit(1)
        
    return psycopg2.connect(db_url)

def fetch_and_load(service_name):
    print(f"--- Fetching {service_name} ---")
    conn = get_db_connection()
    cur = conn.cursor()
    
    # Delete existing data for this service to avoid duplicates during this targeted refresh
    cur.execute("DELETE FROM azure_prices WHERE service_name = %s", (service_name,))
    conn.commit()

    url = f"https://prices.azure.com/api/retail/prices?currencyCode=USD&$filter=serviceName eq '{service_name}'"
    total_fetched = 0
    batch_items = []
    page_count = 0

    try:
        while url:
            response = requests.get(url)
            if response.status_code != 200:
                print(f"API Error: {response.status_code}")
                break
            
            data = response.json()
            items = data.get('Items', [])
            if not items: break
                
            batch_items.extend(items)
            total_fetched += len(items)
            
            if len(batch_items) >= 1000:
                insert_batch(conn, batch_items)
                batch_items = []
                
            url = data.get('NextPageLink')
            page_count += 1
            print(f"Service: {service_name} | Page: {page_count} | Total: {total_fetched}")

        if batch_items:
            insert_batch(conn, batch_items)
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()
    print(f"Done with {service_name}. Total: {total_fetched}")

def insert_batch(conn, items):
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
        type, reservation_term, raw_data, is_active, last_seen_at
    ) VALUES %s
    """
    execute_values(cur, query, values, template="(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE, NOW())")
    conn.commit()
    cur.close()

if __name__ == "__main__":
    # Priority services for the calculator
    fetch_and_load("Virtual Machines")
    fetch_and_load("Storage")
    fetch_and_load("Bandwidth")
