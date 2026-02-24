import { query } from './src/db.js';
async function run() {
    const res = await query(`SELECT sku_name, product_name, type, reservation_term as "reservationTerm", retail_price, raw_data->>'unitOfMeasure' as unit FROM azure_prices WHERE type = 'Reservation' AND service_name = 'Virtual Machines' AND sku_name LIKE '%Standard_D2s_v3%' LIMIT 10`);
    console.log(JSON.stringify(res.rows, null, 2));
    process.exit(0);
}
run();
