import fs from 'fs';
import { query } from './src/db.js';
async function run() {
    const res = await query(`
    SELECT sku_name, product_name, type, reservation_term as "reservationTerm", retail_price, raw_data->>'unitOfMeasure' as unit 
    FROM azure_prices 
    WHERE service_name = 'Virtual Machines' AND type = 'Reservation' AND sku_name ILIKE '%D2s v3%' 
    LIMIT 20
  `);
    fs.writeFileSync('out.json', JSON.stringify(res.rows, null, 2));
    process.exit(0);
}
run();
