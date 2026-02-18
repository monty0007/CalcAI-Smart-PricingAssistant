
import { initDB, query } from './src/db.js';

async function check() {
    try {
        console.log("Checking DB...");
        // 1. Check total prices
        const countRes = await query('SELECT COUNT(*) as count FROM azure_prices');
        console.log("Total Prices:", countRes.rows[0].count);

        // 2. Check currency rates
        const ratesRes = await query('SELECT * FROM currency_rates');
        console.log("Currency Rates:", ratesRes.rows);

        // 3. Test Query for INR
        const sql = `
            SELECT p.id, p.retail_price, cr.rate_from_usd 
            FROM azure_prices p
            CROSS JOIN (SELECT rate_from_usd FROM currency_rates WHERE currency_code = $1) cr
            LIMIT 5
        `;
        const testRes = await query(sql, ['INR']);
        console.log(`Test Query for INR returned ${testRes.rowCount} rows.`);

    } catch (err) {
        console.error("Error:", err);
    }
    process.exit();
}

check();
