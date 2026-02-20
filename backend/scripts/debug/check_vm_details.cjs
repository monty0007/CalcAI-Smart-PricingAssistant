
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function check() {
    try {
        await client.connect();
        // Check Consumption + Virtual Machines + Central India + USD
        const query = `
      SELECT COUNT(*) 
      FROM azure_prices 
      WHERE arm_region_name = 'centralindia' 
      AND service_name = 'Virtual Machines'
      AND type = 'Consumption'
      AND currency_code = 'USD'
    `;
        const res = await client.query(query);
        console.log('Central India VM Consumption (USD) Count:', res.rows[0].count);

        // Also check sample rows to see if they look valid
        const sample = await client.query(`
      SELECT sku_name, product_name, retail_price 
      FROM azure_prices 
      WHERE arm_region_name = 'centralindia' 
      AND service_name = 'Virtual Machines'
      AND type = 'Consumption'
      AND currency_code = 'USD'
      LIMIT 5
    `);
        console.log('Sample:', sample.rows);

        await client.end();
    } catch (err) {
        console.error('ERROR:', err);
    }
}

check();
