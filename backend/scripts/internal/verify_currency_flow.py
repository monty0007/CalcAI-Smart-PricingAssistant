import psycopg2
import os
import sys
import json

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
        return psycopg2.connect(os.environ['DATABASE_URL'])
    except Exception as e:
        print(f"Error connecting to database: {e}")
        sys.exit(1)

def run_test():
    conn = get_db_connection()
    cur = conn.cursor()
    
    print("--- 1. Checking Currency Rates ---")
    cur.execute("SELECT * FROM currency_rates WHERE currency_code = 'EUR'")
    row = cur.fetchone()
    if row:
        print(f"Found EUR: {row}")
    else:
        print("❌ EUR NOT FOUND in currency_rates")

    print("\n--- 2. Checking Azure Prices (Count) ---")
    cur.execute("SELECT COUNT(*) FROM azure_prices")
    print(f"Total Rows: {cur.fetchone()[0]}")

    print("\n--- 3. Testing Conversion Query ---")
    # Simulate the query from db.js
    sql = """
        SELECT p.sku_name, 
               'EUR' as currency_code,
               (p.retail_price * COALESCE(cr.rate_from_usd, 1)) as retail_price
        FROM azure_prices p
        CROSS JOIN (SELECT rate_from_usd, currency_code FROM currency_rates WHERE currency_code = 'EUR') cr
        WHERE p.is_active = TRUE 
          AND p.retail_price > 0
        LIMIT 5
    """
    try:
        cur.execute(sql)
        rows = cur.fetchall()
        print(f"Query successful. Returned {len(rows)} rows.")
        for r in rows:
            print(r)
    except Exception as e:
        print(f"❌ Query Failed: {e}")

    conn.close()

if __name__ == "__main__":
    run_test()
