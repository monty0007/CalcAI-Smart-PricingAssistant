import psycopg2
import os
import sys

def check_products():
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
                
        conn = psycopg2.connect(os.environ['DATABASE_URL'])
        cur = conn.cursor()
        
        print("--- East US Product Counts ---")
        cur.execute("""
            SELECT product_name, COUNT(*) 
            FROM azure_prices 
            WHERE service_name = 'Virtual Machines' 
              AND type = 'Consumption'
              AND arm_region_name = 'eastus'
            GROUP BY product_name
            ORDER BY product_name ASC
            LIMIT 50
        """)
        rows = cur.fetchall()
        for r in rows:
            print(f"{r[0]}: {r[1]}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_products()
