
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function check() {
    try {
        await client.connect();
        const res = await client.query("SELECT COUNT(*) FROM azure_prices WHERE arm_region_name = 'centralindia'");
        console.log('Central India Count:', res.rows[0].count);
        await client.end();
    } catch (err) {
        console.error('ERROR:', err);
    }
}

check();
