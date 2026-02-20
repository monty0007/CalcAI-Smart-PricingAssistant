import os
import psycopg2

def load_env():
    env_path = os.path.join(os.path.dirname(__file__), '../.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    key, value = line.split('=', 1)
                    os.environ[key] = value

def check_db():
    load_env()
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        print("DATABASE_URL not found")
        return
    
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    print("--- Detailed Index SQL ---")
    cur.execute("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'azure_prices';")
    for name, definition in cur.fetchall():
        print(f"{name}: {definition}")

    print("\n--- Uniqueness Check (meter, sku, currency, type, term) ---")
    cur.execute("""
        SELECT meter_id, sku_id, currency_code, type, reservation_term, effective_start_date, COUNT(*)
        FROM azure_prices
        GROUP BY meter_id, sku_id, currency_code, type, reservation_term, effective_start_date
        HAVING COUNT(*) > 1
        LIMIT 5;
    """)
    dups = cur.fetchall()
    if dups:
        print(f"Found {len(dups)} duplicates with start date!")
    else:
        print("Still unique with start date.")

    print("\n--- Uniqueness Check (Excluding start date) ---")
    cur.execute("""
        SELECT meter_id, sku_id, currency_code, type, reservation_term, COUNT(*)
        FROM azure_prices
        GROUP BY meter_id, sku_id, currency_code, type, reservation_term
        HAVING COUNT(*) > 1
        LIMIT 5;
    """)
    dups = cur.fetchall()
    if dups:
        print(f"Found {len(dups)} duplicates excluding start date. Sample:")
        for d in dups:
            print(d)
    else:
        print("Completely unique even without start date? (Unlikely if count doubled)")
    
    print("\nCheck complete. Report written to dupes_report_no_date.txt")
    conn.close()

if __name__ == "__main__":
    check_db()
