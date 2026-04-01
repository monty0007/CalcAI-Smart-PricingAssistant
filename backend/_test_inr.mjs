import { queryPrices } from './src/db.js';

// Test with INR
const inrItems = await queryPrices({
  serviceName: 'Virtual Machines',
  armRegionName: 'centralindia',
  currencyCode: 'INR',
  limit: 5
});
console.log('INR results:', inrItems.length);
if (inrItems.length > 0) {
  console.log('INR sample:', inrItems[0].retailPrice, inrItems[0].currencyCode, inrItems[0].type, inrItems[0].skuName);
}

// Test with USD
const usdItems = await queryPrices({
  serviceName: 'Virtual Machines',
  armRegionName: 'centralindia',
  currencyCode: 'USD',
  limit: 5
});
console.log('USD results:', usdItems.length);
if (usdItems.length > 0) {
  console.log('USD sample:', usdItems[0].retailPrice, usdItems[0].currencyCode, usdItems[0].type, usdItems[0].skuName);
}

// Test with limit=all for INR (same as frontend fetchServicePricingFull)
const inrAll = await queryPrices({
  serviceName: 'Virtual Machines',
  armRegionName: 'centralindia',
  currencyCode: 'INR',
  limit: 'all'
});
console.log('INR limit=all total:', inrAll.length);

// Filter exactly as frontend does in fetchPrices with includeAll=true
const filtered = inrAll.filter(item => item.retailPrice > 0 && item.type !== 'DevTestConsumption');
console.log('INR after frontend filter (price>0, not DevTest):', filtered.length);

// Then filter as filteredPricing memo does
const consumption = filtered.filter(i => {
  if (i.type !== 'Consumption') return false;
  const sku = (i.skuName || '').toLowerCase();
  if (sku.includes('low priority') || sku.includes('spot')) return false;
  return true;
});
console.log('INR after modal Consumption filter:', consumption.length);

// Check Windows specifically
const windows = consumption.filter(i => (i.productName || '').toLowerCase().includes('windows'));
console.log('INR Windows VMs:', windows.length);
if (windows.length > 0) {
  console.log('INR Windows sample:', JSON.stringify(windows[0], null, 2));
}

process.exit(0);
