import 'dotenv/config';
import { query } from './src/db.js';

// Check exactly what exists for VM D8s v5, 1 year, Windows in Central India
const r1 = await query(`
  SELECT sku_name, product_name, location, retail_price
  FROM azure_prices
  WHERE currency_code = 'USD'
    AND is_active = TRUE
    AND service_name = 'Virtual Machines'
    AND sku_name ILIKE '%D8s%v5%'
    AND product_name ILIKE '%Windows%'
  ORDER BY retail_price ASC
  LIMIT 5
`);
console.log('VM D8s v5 Windows rows:', JSON.stringify(r1.rows, null, 2));

// Check for 1-year reservation
const r2 = await query(`
  SELECT sku_name, product_name, location, retail_price
  FROM azure_prices
  WHERE currency_code = 'USD'
    AND is_active = TRUE
    AND service_name = 'Virtual Machines'
    AND (sku_name ILIKE '%1 Year%' OR product_name ILIKE '%1 Year%')
    AND sku_name ILIKE '%D8s%'
  ORDER BY retail_price ASC
  LIMIT 5
`);
console.log('VM 1 Year reservation rows:', JSON.stringify(r2.rows, null, 2));

// Check Managed Disks E10
const r3 = await query(`
  SELECT sku_name, product_name, location, retail_price
  FROM azure_prices
  WHERE currency_code = 'USD'
    AND is_active = TRUE
    AND service_name = 'Storage'
    AND sku_name ILIKE '%E10%'
  ORDER BY retail_price ASC
  LIMIT 5
`);
console.log('Managed Disk E10 rows:', JSON.stringify(r3.rows, null, 2));

// Check bandwidth
const r4 = await query(`
  SELECT sku_name, product_name, service_name, location, retail_price, raw_data->>'meterName' AS meter
  FROM azure_prices
  WHERE currency_code = 'USD'
    AND is_active = TRUE
    AND (service_name ILIKE '%Bandwidth%' OR service_name ILIKE '%Content Delivery%')
  ORDER BY retail_price ASC
  LIMIT 5
`);
console.log('Bandwidth rows:', JSON.stringify(r4.rows, null, 2));

process.exit(0);
