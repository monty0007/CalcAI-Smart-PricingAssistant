
const http = require('http');

// Mock helpers from ServiceConfigModal
function extractCategory(productName, serviceName) {
    let cat = (productName || '').replace(serviceName, '').trim().replace(/^-\s*/, '');
    return cat || 'General';
}

function detectOS(productName) {
    const p = (productName || '').toLowerCase();
    if (p.includes('windows')) return 'Windows';
    if (p.includes('red hat') || p.includes('rhel')) return 'Red Hat';
    if (p.includes('ubuntu')) return 'Ubuntu';
    if (p.includes('suse') || p.includes('sles')) return 'SUSE';
    return 'Linux';
}

function filterItems(allData) {
    console.log('Total items fetched:', allData.length);

    // 1. Filter Consumption
    const consumption = allData.filter(i => i.type === 'Consumption');
    console.log('After type=Consumption:', consumption.length);

    // 2. Filter Spot/Low Priority
    const noSpot = consumption.filter(item => {
        const sku = (item.skuName || '').toLowerCase();
        if (sku.includes('low priority') || sku.includes('spot')) return false;
        return true;
    });
    console.log('After excluding Spot/Low Priority:', noSpot.length);

    // 3. Category grouping (just checking count)
    const categories = new Set();
    noSpot.forEach(item => {
        categories.add(extractCategory(item.productName, item.serviceName));
    });
    console.log('Categories found:', Array.from(categories));

    return noSpot;
}

// Fetch from API
const url = 'http://localhost:3001/api/prices?serviceName=Virtual+Machines&region=centralindia&currency=USD&limit=all';

console.log('Fetching from:', url);

http.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            if (json.Items) {
                const final = filterItems(json.Items);
                console.log('Final filtered count:', final.length);
                // if (final.length > 0) console.log('First item:', JSON.stringify(final[0], null, 2));
            } else {
                console.log('No Items in response:', json);
            }
        } catch (e) {
            console.error('Error parsing JSON:', e);
        }
    });
}).on('error', err => console.error('Error:', err));
