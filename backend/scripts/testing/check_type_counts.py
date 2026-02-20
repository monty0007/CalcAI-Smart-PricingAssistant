import psycopg2
import os
import sys

def check_counts():
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
        
        print("--- VM Type Counts ---")
        cur.execute("""
            SELECT type, COUNT(*) 
            FROM azure_prices 
            WHERE service_name = 'Virtual Machines' 
            GROUP BY type
        """)
        rows = cur.fetchall()
        for r in rows:
            print(f"{r[0]}: {r[1]}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_counts()
