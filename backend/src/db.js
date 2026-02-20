import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// ── PostgreSQL Connection ───────────────────────
// We use a connection pool for efficiency.
// It will use process.env.DATABASE_URL by default if provided,
// or you can pass { connectionString: ... } explicitly.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Add SSL support if needed (e.g. for production Azure/AWS DBs)
    // ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

/**
 * Execute a query with the pool
 */
export async function query(text, params) {
    const start = Date.now();
    const res = await pool.query(text, params);
    // const duration = Date.now() - start;
    // console.log('executed query', { text, duration, rows: res.rowCount });
    return res;
}

// ── Schema ──────────────────────────────────────
// ── Schema ──────────────────────────────────────
export async function initDB() {
    // 1. Create the main table
    // Note: The Python script (initial_pricing_load.py) allows for a complete rebuild.
    // We keep this here ensuring the app works if started fresh.
    await query(`
    CREATE TABLE IF NOT EXISTS azure_prices (
        id BIGSERIAL PRIMARY KEY,
        meter_id TEXT,
        sku_id TEXT,
        
        -- Core fields for filtering
        service_name TEXT,
        service_id TEXT,
        service_family TEXT,
        product_name TEXT,
        sku_name TEXT,
        
        arm_region_name TEXT,
        location TEXT,
        
        currency_code TEXT,
        retail_price DOUBLE PRECISION,
        unit_price DOUBLE PRECISION,
        effective_start_date TIMESTAMP,
        
        type TEXT,
        reservation_term TEXT,
        
        -- Full raw data
        raw_data JSONB,
        
        -- Metadata
        is_active BOOLEAN DEFAULT TRUE,
        last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

    // Currency Rates Table
    await query(`
    CREATE TABLE IF NOT EXISTS currency_rates (
        currency_code TEXT PRIMARY KEY,
        rate_from_usd DOUBLE PRECISION,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    `);

    // Ensure USD is present as base
    await query(`
    INSERT INTO currency_rates (currency_code, rate_from_usd, last_updated)
    VALUES ('USD', 1.0, NOW())
    ON CONFLICT (currency_code) DO NOTHING;
    `);

    // 2. Indexes
    await query(`
    CREATE INDEX IF NOT EXISTS idx_prices_service_region
    ON azure_prices(service_name, arm_region_name);
  `);

    await query(`
    CREATE INDEX IF NOT EXISTS idx_prices_search
    ON azure_prices(product_name, sku_name);
  `);

    await query(`
    CREATE INDEX IF NOT EXISTS idx_prices_active
    ON azure_prices(is_active);
  `);

    // Add indexes for commonly queried fields to prevent full table scans
    await query(`
    CREATE INDEX IF NOT EXISTS idx_prices_currency_code
    ON azure_prices(currency_code);
    `);

    await query(`
    CREATE INDEX IF NOT EXISTS idx_prices_type
    ON azure_prices(type);
    `);

    await query(`
    CREATE INDEX IF NOT EXISTS idx_prices_retail_price
    ON azure_prices(retail_price);
    `);

    // Composite index for the getBestVmPrices query
    await query(`
    CREATE INDEX IF NOT EXISTS idx_prices_vm_query
    ON azure_prices(service_name, type, currency_code, is_active);
    `);

    // 3. User Table
    await query(`
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        google_id TEXT,
        name TEXT,
        preferred_region TEXT DEFAULT 'centralindia',
        preferred_currency TEXT DEFAULT 'INR',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    `);

    // 4. Estimates Table
    await query(`
    CREATE TABLE IF NOT EXISTS estimates (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        name TEXT NOT NULL,
        items JSONB NOT NULL,
        total_cost DOUBLE PRECISION,
        currency TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    `);

    // 5. Sync Log Table
    await query(`
    CREATE TABLE IF NOT EXISTS sync_log (
      id SERIAL PRIMARY KEY,
      started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      completed_at TIMESTAMP WITH TIME ZONE,
      items_synced INTEGER DEFAULT 0,
      status TEXT DEFAULT 'running',
      error TEXT
    );
  `);

    console.log('✅ PostgreSQL database schema initialized');
}

// ── Query Helpers ───────────────────────────────

/**
 * Get prices with filters
 */
export async function queryPrices({
    serviceName,
    armRegionName,
    currencyCode = 'USD',
    type,
    productName,
    skuName,
    search,
    limit = 200,
} = {}) {
    const conditions = [];
    const args = [];
    let paramIndex = 1;

    // 1. Fetch currency rate
    const rateRes = await query('SELECT rate_from_usd FROM currency_rates WHERE currency_code = $1', [currencyCode]);
    const rate = rateRes.rows.length > 0 ? rateRes.rows[0].rate_from_usd : 1.0;

    conditions.push(`p.currency_code = 'USD'`);
    conditions.push(`p.is_active = TRUE`);

    if (serviceName) {
        conditions.push(`p.service_name = $${paramIndex++}`);
        args.push(serviceName);
    }
    if (armRegionName) {
        conditions.push(`p.arm_region_name = $${paramIndex++}`);
        args.push(armRegionName);
    }
    if (type) {
        conditions.push(`p.type = $${paramIndex++}`);
        args.push(type);
    }
    if (productName) {
        conditions.push(`p.product_name = $${paramIndex++}`);
        args.push(productName);
    }
    if (skuName) {
        conditions.push(`p.sku_name = $${paramIndex++}`);
        args.push(skuName);
    }
    if (search) {
        conditions.push(`(p.product_name ILIKE $${paramIndex} OR p.sku_name ILIKE $${paramIndex} OR p.raw_data->>'meterName' ILIKE $${paramIndex})`);
        args.push(`%${search}%`);
        paramIndex++;
    }

    let where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let sql = `
        SELECT p.*
        FROM azure_prices p
        ${where} 
        ORDER BY p.retail_price ASC
    `;

    if (limit !== 'all') {
        sql += ` LIMIT $${paramIndex}`;
        args.push(limit);
    }

    const result = await query(sql, args);
    return result.rows.map(row => rowToItem(row, rate, currencyCode));
}

/**
 * Upsert a batch of items
 * NOTE: This is for Node.js based syncing. 
 * Since we are moving to Python script for ingestion, this might be deprecated 
 * or needs to be updated to match new schema if we still want Node to write.
 * For now, I'll update it to match new schema roughly, but Python is primary.
 */
export async function upsertPrices(items) {
    if (items.length === 0) return 0;
    // Implementation left as is or updated if needed. 
    // Since USER said "updates will be manual... trigger Python script", 
    // we can probably leave this or simplify. 
    // I will comment it out or leave as legacy to avoid breaking imports, 
    // but it won't work with new schema without rewrite.
    // Let's throw error to avoid misuse.
    console.warn("⚠️ upsertPrices in Node is deprecated. Use python script.");
    return 0;
}

/**
 * Get last sync info
 */
export async function getLastSync() {
    const result = await query(
        `SELECT * FROM sync_log ORDER BY id DESC LIMIT 1`
    );
    return result.rows[0] || null;
}

/**
 * Create sync log entry
 */
export async function createSyncLog() {
    const result = await query(
        `INSERT INTO sync_log (started_at, status) VALUES (NOW(), 'running') RETURNING id`
    );
    return result.rows[0].id;
}

/**
 * Complete sync log entry
 */
export async function completeSyncLog(id, itemsSynced, error = null) {
    await query(
        `UPDATE sync_log SET completed_at = NOW(), items_synced = $1, status = $2, error = $3 WHERE id = $4`,
        [itemsSynced, error ? 'failed' : 'completed', error, id]
    );
}

/**
 * Get total price count
 */
export async function getPriceCount() {
    const result = await query('SELECT COUNT(*) as count FROM azure_prices');
    return Number(result.rows[0].count);
}

// ── Row → API-compatible item ───────────────────
function rowToItem(row, rate = 1.0, requestedCurrency = 'USD') {
    // Return raw_data combined with flattened columns unique info
    if (row.raw_data) {
        return {
            ...row.raw_data,
            // Ensure overrides from columns and conversion
            retailPrice: row.retail_price * rate,
            unitPrice: row.unit_price * rate,
            currencyCode: requestedCurrency,
            meterId: row.meter_id
        };
    }

    return {
        meterId: row.meter_id,
        skuId: row.sku_id,
        serviceName: row.service_name,
        retailPrice: row.retail_price * rate,
        currencyCode: requestedCurrency,
        productName: row.product_name,
        skuName: row.sku_name,
        armRegionName: row.arm_region_name
    };
}

/**
 * Get best price per VM SKU (Linux, non-spot)
 */
export async function getBestVmPrices(currencyCode = 'USD') {
    let sql;
    const params = [];

    // 1. Fetch currency rate
    const rateRes = await query('SELECT rate_from_usd FROM currency_rates WHERE currency_code = $1', [currencyCode]);
    const rate = rateRes.rows.length > 0 ? rateRes.rows[0].rate_from_usd : 1.0;

    sql = `
    SELECT sku_name, MIN(retail_price) as min_price, arm_region_name
    FROM azure_prices
    WHERE service_name = 'Virtual Machines'
      AND type = 'Consumption'
      AND retail_price > 0
      AND currency_code = 'USD'
      AND product_name NOT ILIKE '%Windows%'
      AND product_name NOT ILIKE '%Spot%'
      AND product_name NOT ILIKE '%Low Priority%'
      AND is_active = TRUE
    GROUP BY sku_name, arm_region_name
    `;

    const result = await query(sql);
    return result.rows.map(row => ({
        skuName: row.sku_name,
        minPrice: row.min_price * rate,
        region: row.arm_region_name
    }));
}

export default {
    query,
    initDB,
    queryPrices,
    upsertPrices,
    getLastSync,
    createSyncLog,
    completeSyncLog,
    getPriceCount,
    getBestVmPrices
};
