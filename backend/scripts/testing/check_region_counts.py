import psycopg2
import os
import sys

def check_regions():
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
        
        print("--- VM Region Counts (Consumption) ---")
        cur.execute("""
            SELECT arm_region_name, COUNT(*) 
            FROM azure_prices 
            WHERE service_name = 'Virtual Machines' 
              AND type = 'Consumption'
            GROUP BY arm_region_name
            ORDER BY COUNT(*) DESC
            LIMIT 20
        """)
        rows = cur.fetchall()
        for r in rows:
            print(f"{r[0]}: {r[1]}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_regions()
