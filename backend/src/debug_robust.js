import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load .env explicitly
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const { Pool } = pg;

console.log('Current directory:', process.cwd());
console.log('DATABASE_URL present:', !!process.env.DATABASE_URL);

if (!process.env.DATABASE_URL) {
    console.error('❌ Missing DATABASE_URL');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function run() {
    try {
        console.log('Connecting to DB...');
        const client = await pool.connect();
        console.log('Connected!');

        console.log('--- Checking Prices ---');
        const countRes = await client.query('SELECT COUNT(*) as count FROM azure_prices');
        console.log('Total prices:', countRes.rows[0].count);

        const serviceRes = await client.query(`
            SELECT service_name, COUNT(*) as count 
            FROM azure_prices 
            GROUP BY service_name 
            ORDER BY count DESC 
            LIMIT 5
        `);
        console.table(serviceRes.rows);

        client.release();
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

run();
