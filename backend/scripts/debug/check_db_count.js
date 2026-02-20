import db from './src/db.js';

async function check() {
    try {
        const res = await db.execute('SELECT count(*) as c FROM azure_prices');
        console.log('Final Record Count:', res.rows[0].c);
        process.exit(0);
    } catch (err) {
        console.error('Error checking count:', err);
        process.exit(1);
    }
}

check();
