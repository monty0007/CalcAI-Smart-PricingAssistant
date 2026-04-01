import { queryPrices } from './src/db.js';

const items = await queryPrices({
  serviceName: 'Virtual Machines',
  armRegionName: 'centralindia',
  currencyCode: 'INR',
  limit: 'all'
});

console.log('Total items:', items.length);

const consumption = items.filter(i => {
  if (i.type !== 'Consumption') return false;
  const sku = (i.skuName || '').toLowerCase();
  if (sku.includes('low priority') || sku.includes('spot')) return false;
  return true;
});
console.log('Consumption (no spot/low-priority):', consumption.length);

const windows = consumption.filter(i => (i.productName || '').toLowerCase().includes('windows'));
const linux = consumption.filter(i => !(i.productName || '').toLowerCase().includes('windows'));
console.log('Windows:', windows.length);
console.log('Linux/Other:', linux.length);

const withPrice = consumption.filter(i => i.retailPrice > 0);
console.log('With price > 0:', withPrice.length);

console.log('\nSample:', JSON.stringify(consumption.slice(0, 2), null, 2));

process.exit(0);
