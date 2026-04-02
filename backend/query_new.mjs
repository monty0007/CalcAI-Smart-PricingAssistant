import { query } from './src/db.js';
const r = await query(`SELECT DISTINCT service_name FROM azure_prices WHERE is_active=true AND (service_name ILIKE '%kubernetes%' OR service_name ILIKE '%redis%' OR service_name ILIKE '%API Management%' OR service_name ILIKE '%Load Balancer%' OR service_name ILIKE '%Container%' OR service_name ILIKE '%App Service%' OR service_name ILIKE '%Functions%' OR service_name ILIKE '%SQL%' OR service_name ILIKE '%Cosmos%') ORDER BY service_name LIMIT 40`);
r.rows.forEach(r2 => console.log(r2.service_name));

// Sample meters for AKS
const r2 = await query(`SELECT DISTINCT raw_data->>'meterName' as m, sku_name, retail_price FROM azure_prices WHERE service_name ILIKE '%kubernetes%' AND is_active=true AND type='Consumption' AND arm_region_name='eastus' ORDER BY retail_price LIMIT 15`);
console.log('\n=== AKS METERS ===');
r2.rows.forEach(r3 => console.log(r3.m + ' | ' + r3.sku_name + ' | $' + r3.retail_price));

// Redis
const r3 = await query(`SELECT DISTINCT raw_data->>'meterName' as m, sku_name, retail_price, product_name FROM azure_prices WHERE service_name ILIKE '%redis%' AND is_active=true AND type='Consumption' AND arm_region_name='eastus' ORDER BY retail_price LIMIT 15`);
console.log('\n=== REDIS METERS ===');
r3.rows.forEach(r4 => console.log(r4.m + ' | ' + r4.sku_name + ' | $' + r4.retail_price + ' | ' + r4.product_name));

// Load Balancer
const r4 = await query(`SELECT DISTINCT raw_data->>'meterName' as m, sku_name, retail_price, product_name FROM azure_prices WHERE service_name ILIKE '%load balancer%' AND is_active=true AND type='Consumption' AND arm_region_name='eastus' ORDER BY retail_price LIMIT 10`);
console.log('\n=== LOAD BALANCER METERS ===');
r4.rows.forEach(r5 => console.log(r5.m + ' | ' + r5.sku_name + ' | $' + r5.retail_price + ' | ' + r5.product_name));

// API Management
const r5 = await query(`SELECT DISTINCT raw_data->>'meterName' as m, sku_name, retail_price, product_name FROM azure_prices WHERE service_name ILIKE '%API Management%' AND is_active=true AND type='Consumption' AND arm_region_name='eastus' ORDER BY retail_price LIMIT 10`);
console.log('\n=== API MANAGEMENT METERS ===');
r5.rows.forEach(r6 => console.log(r6.m + ' | ' + r6.sku_name + ' | $' + r6.retail_price + ' | ' + r6.product_name));

process.exit(0);
