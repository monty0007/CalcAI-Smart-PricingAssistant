import { query } from './src/db.js';
import fs from 'fs';

async function run() {
  const skus = ['d8s v5', 'f8s v2', 'f8 v2'];
  const results = {};

  for (const sku of skus) {
    const cleanSku = sku.replace(/[_\s]+/g, '%').trim();
    const sql = `
      SELECT sku_name, product_name, raw_data->>'meterName' as meter, arm_region_name, retail_price, is_active, currency_code
      FROM azure_prices 
      WHERE service_name = 'Virtual Machines'
        AND arm_region_name = 'centralindia'
        AND type = 'Consumption'
        AND sku_name ILIKE $1
        AND product_name NOT ILIKE '%Windows%'
        AND product_name NOT ILIKE '%Spot%'
      LIMIT 1;
    `;
    try {
      const res = await query(sql, [`%${cleanSku}%`]);
      results[sku] = res.rows;
    } catch (e) {
      results[sku] = { error: e.message };
    }
  }

  fs.writeFileSync('debug_db_results.json', JSON.stringify(results, null, 2));
  console.log("Debug results written to debug_db_results.json");
  process.exit();
}
run();
