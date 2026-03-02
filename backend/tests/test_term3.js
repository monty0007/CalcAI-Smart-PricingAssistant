import { query } from './src/db.js';
async function run() {
    let res = await query(`SELECT COUNT(*) as count FROM azure_prices WHERE type = 'Reservation'`);
    console.log('Total reservations:', res.rows[0].count);
    res = await query(`SELECT sku_name, product_name, type, reservation_term as "reservationTerm", retail_price, raw_data->>'unitOfMeasure' as unit FROM azure_prices WHERE type = 'Reservation' AND service_name = 'Virtual Machines' LIMIT 2`);
    console.log('VM reservations:', JSON.stringify(res.rows, null, 2));
    process.exit(0);
}
run();
