import fetch from 'node-fetch';

async function test() {
    const payload = {
        items: [
            {
                type: "vm",
                sku: "f8 v2",
                os: "linux",
                region: "centralindia",
                quantity: 1
            }
        ],
        currency: "USD"
    };

    try {
        const res = await fetch('http://localhost:3001/api/tools/calculate_estimate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            console.error("Error:", res.status, await res.text());
            return;
        }

        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Fetch failed:", e.message);
    }
}

test();
