import { query } from './src/db.js';

async function checkEstimates() {
    try {
        const result = await query(
            `SELECT id, name, items
             FROM estimates LIMIT 2`
        );
        console.log("ITEMS:", result.rows[0].items);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
checkEstimates();
