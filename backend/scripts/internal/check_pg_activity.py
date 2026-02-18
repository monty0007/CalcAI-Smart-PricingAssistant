import psycopg2
import os
import sys

def check_activity():
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
        
        print("--- Active Queries ---")
        cur.execute("""
            SELECT pid, state, query_start, query 
            FROM pg_stat_activity 
            WHERE state != 'idle' 
              AND pid <> pg_backend_pid()
        """)
        rows = cur.fetchall()
        for r in rows:
            print(f"PID: {r[0]} | State: {r[1]} | Start: {r[2]}")
            print(f"Query: {r[3]}")
            print("-" * 40)
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_activity()
