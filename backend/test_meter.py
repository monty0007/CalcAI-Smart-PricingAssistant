import psycopg2
import sys

def check_sku(sku_name):
    conn = psycopg2.connect('dbname=azure_pricing user=postgres password=postgres host=localhost')
    cur = conn.cursor()
    cur.execute(f"""
        SELECT sku_name, product_name, raw_data->>'meterName' AS meter_name
        FROM azure_prices 
        WHERE service_name = 'Virtual Machines' 
          AND arm_region_name = 'centralindia'
          AND sku_name ILIKE '%{sku_name}%'
          AND type = 'Consumption'
          AND product_name NOT ILIKE '%Windows%'
          AND product_name NOT ILIKE '%Spot%'
          AND product_name NOT ILIKE '%Dedicated Host%'
        LIMIT 5;
    """)
    rows = cur.fetchall()
    print(f"Matches for {sku_name}: {len(rows)}")
    for r in rows:
        print(f"SKU: {r[0]}, Product: {r[1]}, Meter: {r[2]}")
    conn.close()

check_sku('d8s v5')
check_sku('f8s v2')
check_sku('f8 v2')
