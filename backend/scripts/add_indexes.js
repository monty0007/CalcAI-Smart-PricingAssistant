/**
 * add_indexes.js
 * Run once to add missing composite/partial indexes that dramatically speed up
 * the /api/prices and /api/vm-list queries.
 *
 * Usage: node backend/scripts/add_indexes.js
 */

import { createRequire } from 'module';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function q(label, sql) {
    const start = Date.now();
    process.stdout.write(`  Creating ${label}... `);
    try {
        await pool.query(sql);
        console.log(`done (${Date.now() - start}ms)`);
    } catch (err) {
        console.log(`FAILED: ${err.message}`);
    }
}

async function main() {
    console.log('\n🔧 Azure Pricing DB — Index Migration');
    console.log('═'.repeat(50));

    // ── Drop old ineffective single-column indexes ─────────────────
    console.log('\n▶  Removing old partial indexes (if any)...');
    await pool.query(`DROP INDEX IF EXISTS idx_prices_active`).catch(() => { });
    await pool.query(`DROP INDEX IF EXISTS idx_prices_currency_code`).catch(() => { });
    await pool.query(`DROP INDEX IF EXISTS idx_prices_type`).catch(() => { });
    await pool.query(`DROP INDEX IF EXISTS idx_prices_retail_price`).catch(() => { });

    // ── Drop old vm_query index so we can replace it with a covering one ─
    await pool.query(`DROP INDEX IF EXISTS idx_prices_vm_query`).catch(() => { });

    console.log('\n▶  Creating optimized indexes (this may take 30-120s on large tables)...');

    // 1. Primary dashboard filter covering index
    //    Handles: WHERE arm_region_name = X AND service_name = Y AND currency_code = 'USD' AND is_active = TRUE
    //    + ORDER BY retail_price ASC
    await q(
        'idx_prices_dashboard',
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prices_dashboard
         ON azure_prices(arm_region_name, service_name, currency_code, is_active, retail_price);`
    );

    // 2. Partial index — only active USD rows (the most common hot path)
    //    Dramatically shrinks the index; pre-filters ~60-70% of the table
    await q(
        'idx_prices_active_usd',
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prices_active_usd
         ON azure_prices(arm_region_name, service_name, sku_name, retail_price)
         WHERE is_active = TRUE AND currency_code = 'USD';`
    );

    // 3. Covering index for getBestVmPrices GROUP BY query
    await q(
        'idx_prices_vm_query',
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prices_vm_query
         ON azure_prices(service_name, type, currency_code, is_active, retail_price, sku_name, arm_region_name);`
    );

    // 4. Also run ANALYZE so the query planner has fresh stats
    console.log('\n▶  Running ANALYZE to update planner statistics...');
    await pool.query('ANALYZE azure_prices;');
    console.log('  ANALYZE complete.');

    // ── Show all current indexes ───────────────────────────────────
    const res = await pool.query(
        `SELECT indexname, pg_size_pretty(pg_relation_size(indexrelid)) as size
         FROM pg_stat_user_indexes
         WHERE relname = 'azure_prices'
         ORDER BY pg_relation_size(indexrelid) DESC;`
    );

    console.log('\n📋 Current indexes on azure_prices:');
    res.rows.forEach(r => console.log(`   ${r.indexname.padEnd(40)} ${r.size}`));

    console.log('\n✅ Done. Restart the backend to pick up the initDB changes.\n');
    await pool.end();
}

main().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
