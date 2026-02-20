import psycopg2
import os
import sys

def migrate_prefs():
    try:
        # load_dotenv(os.path.join(os.path.dirname(__file__), '../.env'))
        env_path = os.path.join(os.path.dirname(__file__), '../.env')
        if os.path.exists(env_path):
            with open(env_path, 'r') as f:
                for line in f:
                    if line.strip() and not line.startswith('#'):
                        key, value = line.strip().split('=', 1)
                        if key == 'DATABASE_URL':
                            os.environ['DATABASE_URL'] = value
                            break
        
        conn = psycopg2.connect(os.environ['DATABASE_URL'])
        cur = conn.cursor()
        
        print("--- Migrating Users Table ---")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_region TEXT DEFAULT 'centralindia';")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_currency TEXT DEFAULT 'INR';")
        conn.commit()
        print("✅ Migration Complete: Added preferred_region and preferred_currency.")
            
    except Exception as e:
        print(f"Error: {e}")
        if 'psycopg2' not in str(type(e)):
             # Fallback manual env load if dotenv fails/missing
             pass

if __name__ == "__main__":
    migrate_prefs()
