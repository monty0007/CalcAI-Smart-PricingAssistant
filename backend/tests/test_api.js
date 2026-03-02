import fetch from 'node-fetch';
import fs from 'fs';

const body = {
    currency: "USD",
    items: [
        {
            category: "Compute",
            service: "Virtual Machines",
            name: "App server",
            configuration: { sku: "D8s v5", os: "Windows", reservation: "1 Year", region: "centralindia", quantity: 1 }
        },
        {
            category: "Storage",
            service: "Managed Disks",
            name: "DB Disk",
            configuration: { diskType: "E10", diskTier: "Standard SSD", diskRedundancy: "LRS", quantity: 1 }
        },
        {
            category: "Networking",
            service: "Bandwidth",
            name: "Outbound Network",
            configuration: { dataTransferGB: 150, transferType: "Internet egress" }
        },
        {
            category: "Security",
            service: "Microsoft Defender for Cloud",
            name: "Defender",
            configuration: { serverCount: 1 }
        },
        {
            category: "DevOps",
            service: "Azure Monitor",
            name: "Log Analytics",
            configuration: { dataIngestionGB: 0.2, tier: "Pay-as-you-go" }
        }
    ]
};

fetch('http://localhost:3001/api/tools/calculate_estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
})
    .then(async res => {
        const json = await res.json();
        fs.writeFileSync('test_out.json', JSON.stringify(json, null, 2));
        console.log('Done!');
    })
    .catch(err => {
        console.error('Fetch error:', err.message);
    });
