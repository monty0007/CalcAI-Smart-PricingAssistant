import requests
import json
import sys

def inspect_data():
    # Fetch 50 sample items for Virtual Machines
    url = "http://localhost:3001/api/prices?serviceName=Virtual%20Machines&region=southcentralus&limit=50"
    try:
        response = requests.get(url)
        data = response.json()
        items = data.get('Items', [])
        
        print(f"Fetched {len(items)} items.")
        
        for i, item in enumerate(items):
            if i >= 5: break
            print(f"\n--- Item {i+1} ---")
            print(f"Service: '{item.get('serviceName')}'")
            print(f"Product: '{item.get('productName')}'")
            print(f"SKU: '{item.get('skuName')}'")
            print(f"Type: '{item.get('type')}'")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_data()
