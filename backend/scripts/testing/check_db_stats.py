import psycopg2
import os
import sys

def check_stats():
    try:
        # Load env
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
        
        print("--- Database Stats ---")
        
        # Total Count
        cur.execute("SELECT COUNT(*) FROM azure_prices")
        count = cur.fetchone()[0]
        print(f"Total Rows: {count}")
        
        if count == 0:
            print("❌ Database is empty!")
            return

        # Distinct Services
        cur.execute("SELECT COUNT(DISTINCT service_name) FROM azure_prices")
        print(f"Distinct Services: {cur.fetchone()[0]}")
        
        # Virtual Machines Count
        cur.execute("SELECT COUNT(*) FROM azure_prices WHERE service_name = 'Virtual Machines'")
        vm_count = cur.fetchone()[0]
        print(f"Virtual Machines Rows: {vm_count}")

            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_stats()
