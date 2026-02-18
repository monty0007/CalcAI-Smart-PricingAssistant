import urllib.request
import urllib.parse
import json
import time
import sys
import os

# Configuration
API_URL = "https://prices.azure.com/api/retail/prices"
FILTER = "" 
OUTPUT_FILE = "all_currencies_pricing_dump.json"

# Supported currencies from frontend
CURRENCIES = [
    'USD', 'INR', 'EUR', 'GBP', 'AUD', 
    'CAD', 'JPY', 'BRL', 'KRW', 'SGD'
]

def fetch_data():
    print(f"🚀 Starting Multi-Currency Pricing Fetch...")
    print(f"📂 Output file: {OUTPUT_FILE}")
    print(f"💱 Currencies ({len(CURRENCIES)}): {', '.join(CURRENCIES)}")

    item_count = 0
    start_time = time.time()
    
    # Open file in write mode and start JSON array
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write('[\n')
        
        for idx, currency in enumerate(CURRENCIES):
            currency_start = time.time()
            print(f"\n[{idx+1}/{len(CURRENCIES)}] Fetching {currency}...")
            
            url = API_URL + f"?currencyCode={currency}"
            if FILTER:
                url += f"&$filter={urllib.parse.quote(FILTER)}"

            page_count = 0
            curr_item_count = 0
            
            try:
                while url:
                    # Fetch data
                    retry_count = 0
                    max_retries = 3
                    data = None
                    
                    while retry_count < max_retries:
                        try:
                            with urllib.request.urlopen(url, timeout=30) as response:
                                if response.status != 200:
                                    print(f"\n❌ Error: Status {response.status}")
                                    break
                                
                                data = json.loads(response.read().decode())
                                break # Success
                        except Exception as e:
                            retry_count += 1
                            print(f"\n⚠️ Request failed (Attempt {retry_count}/{max_retries}): {e}")
                            time.sleep(2)
                    
                    if not data:
                        print(f"\n❌ Failed to fetch page for {currency}. Skipping remaining pages.")
                        break

                    items = data.get('Items', [])
                    if not items:
                        break
                    
                    # Write items to file
                    for item in items:
                        # Add comma if this is not the very first item written
                        if item_count > 0:
                            f.write(',\n')
                        
                        # Ensure currency code is set (API usually returns it, but safety first)
                        if 'currencyCode' not in item or not item['currencyCode']:
                            item['currencyCode'] = currency
                            
                        json.dump(item, f, indent=0)
                        item_count += 1
                        curr_item_count += 1

                    # Pagination
                    url = data.get('NextPageLink')
                    page_count += 1

                    # Progress update
                    sys.stdout.write(f"\r  📄 Page: {page_count} | 📦 {currency} Items: {curr_item_count} | Total: {item_count}")
                    sys.stdout.flush()

            except KeyboardInterrupt:
                print("\n\n🛑 Process interrupted by user.")
                f.write('\n]')
                return
            
            print(f"\n  ✅ {currency} complete. Fetched {curr_item_count} items in {time.time() - currency_start:.1f}s")
            
        # Close JSON array
        f.write('\n]')
    
    total_time = time.time() - start_time
    print(f"\n\n🎉 All Done! Saved {item_count} items to {OUTPUT_FILE}")
    print(f"⏱️ Total time: {total_time/60:.1f} minutes")

if __name__ == "__main__":
    fetch_data()
