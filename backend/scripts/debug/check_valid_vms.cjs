
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function check() {
    try {
        await client.connect();
        // Check Consumption + Virtual Machines + Central India + USD
        // Exclude Spot/Low Priority to mimic frontend
        const query = `
      SELECT COUNT(*) 
      FROM azure_prices 
      WHERE arm_region_name = 'centralindia' 
      AND service_name = 'Virtual Machines'
      AND type = 'Consumption'
      AND currency_code = 'USD'
      AND product_name NOT ILIKE '%Spot%'
      AND product_name NOT ILIKE '%Low Priority%'
      AND sku_name NOT ILIKE '%Spot%'
      AND sku_name NOT ILIKE '%Low Priority%'
    `;
        const res = await client.query(query);
        console.log('Valid Central India VMs (USD):', res.rows[0].count);

        await client.end();
    } catch (err) {
        console.error('ERROR:', err);
    }
}

check();
