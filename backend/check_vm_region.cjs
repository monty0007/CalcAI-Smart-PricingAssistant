
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function check() {
    try {
        await client.connect();
        const res = await client.query("SELECT COUNT(*) FROM azure_prices WHERE arm_region_name = 'centralindia' AND service_name = 'Virtual Machines'");
        console.log('Central India VM Count:', res.rows[0].count);

        const res2 = await client.query("SELECT COUNT(*) FROM azure_prices WHERE arm_region_name = 'eastus' AND service_name = 'Virtual Machines'");
        console.log('East US VM Count:', res2.rows[0].count);

        await client.end();
    } catch (err) {
        console.error('ERROR:', err);
    }
}

check();
