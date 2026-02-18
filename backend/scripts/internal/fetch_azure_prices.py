import urllib.request
import json
import time
import sys

# Configuration
API_URL = "https://prices.azure.com/api/retail/prices"
# You can add filters if needed, e.g., "serviceName eq 'Virtual Machines'"
# For all data, leave filter empty or minimal.
# Note: Fetching ALL Azure data takes a long time (hundreds of thousands of items).
FILTER = "" 
OUTPUT_FILE = "azure_pricing_dump.json"
CURRENCIES = ['USD', 'INR']

def fetch_data():
    print(f"🚀 Starting Azure Pricing Fetch...")
    print(f"📂 Output file: {OUTPUT_FILE}")
    print(f"💱 Currencies: {', '.join(CURRENCIES)}")

    item_count = 0
    
    # Open file in write mode and start JSON array
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write('[\n')
        
        # Hardcoded to USD only for canonical dataset
        currency = 'USD'
        print(f"\n--- Fetching {currency} ---")
        url = API_URL + f"?currencyCode={currency}"
        if FILTER:
            url += f"&$filter={urllib.parse.quote(FILTER)}"

        page_count = 0
        
        try:
            while url:
                # Fetch data
                try:
                    with urllib.request.urlopen(url) as response:
                        if response.status != 200:
                            print(f"\n❌ Error: Status {response.status}")
                            break
                        
                        data = json.loads(response.read().decode())
                except Exception as e:
                    print(f"\n❌ Request failed: {e}")
                    # Retry logic could be added here
                    break

                items = data.get('Items', [])
                if not items:
                    print("\n⚠️ No items found in this page.")
                
                # Write items to file
                for i, item in enumerate(items):
                    # Add comma if this is not the very first item written
                    if item_count > 0:
                        f.write(',\n')
                    
                    json.dump(item, f, indent=2)
                    item_count += 1

                # Pagination
                url = data.get('NextPageLink')
                page_count += 1

                # Progress update
                sys.stdout.write(f"\r📄 Page: {page_count} | 📦 Total Items: {item_count}")
                sys.stdout.flush()

                # Basic rate limiting prevention
                # time.sleep(0.5) 

        except KeyboardInterrupt:
            print("\n\n🛑 Process interrupted by user.")
            # We want to stop everything if user interrupts
            f.write('\n]')
            return
            
        # Close JSON array
        f.write('\n]')
    
    print(f"\n\n✅ Done! Saved {item_count} items to {OUTPUT_FILE}")

if __name__ == "__main__":
    fetch_data()
