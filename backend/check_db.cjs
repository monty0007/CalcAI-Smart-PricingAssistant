
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function check() {
    try {
        await client.connect();

        console.log('--- CURRENCIES ---');
        const resCur = await client.query('SELECT DISTINCT currency_code FROM azure_prices LIMIT 10');
        resCur.rows.forEach(r => console.log(r.currency_code));

        console.log('\n--- REGIONS (Top 10) ---');
        const resReg = await client.query('SELECT arm_region_name, COUNT(*) as c FROM azure_prices GROUP BY arm_region_name ORDER BY c DESC LIMIT 10');
        resReg.rows.forEach(r => console.log(`${r.arm_region_name}: ${r.c}`));

        console.log('\n--- VM CHECK ---');
        const resVM = await client.query("SELECT COUNT(*) FROM azure_prices WHERE service_name = 'Virtual Machines'");
        console.log('VM Count:', resVM.rows[0].count);

        await client.end();
    } catch (err) {
        console.error('ERROR:', err);
    }
}

check();
