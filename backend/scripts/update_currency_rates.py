import requests
import psycopg2
import os
import sys
import time
from datetime import datetime

# Configuration
# SKU to use for rate comparison (must be stable and available in all regions/currencies)
# Standard_D2s_v5 is a very common VM.
REFERENCE_SKU = "Standard_D2s_v5" 
REFERENCE_REGION = "southcentralus" 
API_URL = "https://prices.azure.com/api/retail/prices"

# Currencies to support
SUPPORTED_CURRENCIES = [
    "AUD","BRL","CAD","DKK","EUR","INR","JPY","KRW","NZD","NOK","RUB","SEK","CHF","TWD","GBP"
]

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
        return None

def init_currency_table(conn):
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS currency_rates (
            currency_code TEXT PRIMARY KEY,
            rate_from_usd DOUBLE PRECISION,
            last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    """)
    # Ensure USD exists
    cur.execute("""
        INSERT INTO currency_rates (currency_code, rate_from_usd, last_updated)
        VALUES ('USD', 1.0, NOW())
        ON CONFLICT (currency_code) DO NOTHING;
    """)
    conn.commit()
    cur.close()

def fetch_price(currency):
    # Fetch a specific SKU in a specific region
    # We filter specifically to get 1 item to minimize payload
    query = f"serviceName eq 'Virtual Machines' and armRegionName eq '{REFERENCE_REGION}' and skuName eq '{REFERENCE_SKU}' and priceType eq 'Consumption'"
    url = f"{API_URL}?currencyCode={currency}&$filter={query}&$top=1"
    
    try:
        response = requests.get(url)
        if response.status_code != 200:
            print(f"Error fetching {currency}: {response.status_code}")
            return None
        
        data = response.json()
        items = data.get('Items', [])
        if not items:
            print(f"No items found for {currency}")
            return None
            
        return items[0].get('retailPrice')
    except Exception as e:
        print(f"Exception fetching {currency}: {e}")
        return None

def update_rates():
    conn = get_db_connection()
    if not conn:
        print("Failed to connect to DB")
        return

    init_currency_table(conn)
    cur = conn.cursor()

    print(f"--- Updating Exchange Rates (Ref SKU: {REFERENCE_SKU}) ---")

    # 1. Get Base USD Price
    usd_price = fetch_price('USD')
    if not usd_price or usd_price == 0:
        print("CRITICAL: Could not fetch base USD price. Aborting.")
        return

    print(f"Base USD Price: ${usd_price}")

    # 2. Iterate and Update
    results = []
    
    for currency in SUPPORTED_CURRENCIES:
        if currency == 'USD':
            continue
            
        local_price = fetch_price(currency)
        
        if local_price and local_price > 0:
            rate = local_price / usd_price
            print(f"{currency}: {local_price} (Rate: {rate:.4f})")
            
            cur.execute("""
                INSERT INTO currency_rates (currency_code, rate_from_usd, last_updated)
                VALUES (%s, %s, NOW())
                ON CONFLICT (currency_code) DO UPDATE SET
                    rate_from_usd = EXCLUDED.rate_from_usd,
                    last_updated = NOW();
            """, (currency, rate))
            results.append((currency, rate))
        else:
            print(f"⚠️ Failed to calculate rate for {currency}")

    conn.commit()
    cur.close()
    conn.close()
    print("\n✅ Currency rates updated successfully.")

if __name__ == "__main__":
    update_rates()
