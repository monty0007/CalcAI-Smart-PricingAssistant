import requests
import sys

def test_api():
    url = "http://localhost:3001/api/prices?limit=1&currency=EUR"
    try:
        print(f"Requesting {url}...")
        response = requests.get(url)
        print(f"Status Code: {response.status_code}")
        try:
            print("Response JSON:")
            print(json.dumps(response.json(), indent=2))
        except:
            print("Response Text:")
            print(response.text)
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    import json
    test_api()
