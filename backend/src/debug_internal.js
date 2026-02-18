import { initDB, query } from './db.js';

async function debug() {
    try {
        console.log('Initializing DB...');
        await initDB();

        console.log('--- Price Counts by Service ---');
        const services = await query(`
            SELECT service_name, COUNT(*) as count 
            FROM azure_prices 
            GROUP BY service_name 
            ORDER BY count DESC 
            LIMIT 10
        `);
        console.table(services.rows);

        console.log('--- Price Counts by Region ---');
        const regions = await query(`
            SELECT arm_region_name, COUNT(*) as count 
            FROM azure_prices 
            GROUP BY arm_region_name 
            ORDER BY count DESC 
            LIMIT 10
        `);
        console.table(regions.rows);

        console.log('--- Price Counts by Currency ---');
        const currencies = await query(`
            SELECT currency_code, COUNT(*) as count 
            FROM azure_prices 
            GROUP BY currency_code 
            ORDER BY count DESC
        `);
        console.table(currencies.rows);

        console.log('--- Sample Virtual Machines Data ---');
        const vmSample = await query(`
            SELECT * FROM azure_prices 
            WHERE service_name = 'Virtual Machines' 
            LIMIT 1
        `);
        console.log(vmSample.rows[0]);

    } catch (err) {
        console.error('Error:', err);
    }
}

debug();
