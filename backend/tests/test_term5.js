import fs from 'fs';
import { query } from './src/db.js';
async function run() {
    const res = await query(`
    SELECT sku_name, raw_data 
    FROM azure_prices 
    WHERE service_name = 'Virtual Machines' AND type = 'Reservation' AND sku_name ILIKE '%D2s v3%' 
    LIMIT 2
  `);
    fs.writeFileSync('raw_data_out.json', JSON.stringify(res.rows, null, 2));
    process.exit(0);
}
run();
