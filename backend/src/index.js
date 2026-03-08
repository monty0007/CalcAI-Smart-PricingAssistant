import express from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import { initDB, queryPrices, getLastSync, getPriceCount, getBestVmPrices } from './db.js';
import { runFullSync, runQuickSync } from './sync.js';
import { initScheduler } from './scheduler.js';
import authRouter, { authenticateToken } from './auth.js';
import toolsRouter from './aiTools.js';
import chatsRouter from './chats.js';
import estimatesRouter from './estimates.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ── Server-side in-process response cache (15-minute TTL) ────────────────────
const SERVER_CACHE = new Map();
const SERVER_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function serverCacheGet(key) {
    const entry = SERVER_CACHE.get(key);
    if (!entry) return null;
    if (Date.now() - entry.t > SERVER_CACHE_TTL) { SERVER_CACHE.delete(key); return null; }
    return entry.d;
}

function serverCacheSet(key, data) {
    // Limit to 200 entries to prevent unbounded growth
    if (SERVER_CACHE.size >= 200) {
        const firstKey = SERVER_CACHE.keys().next().value;
        SERVER_CACHE.delete(firstKey);
    }
    SERVER_CACHE.set(key, { t: Date.now(), d: data });
}

// ── Middleware ───────────────────────────────────
app.use(cors());
app.use(compression());
app.use(express.json());

// ── Routes ──────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/tools', toolsRouter);
app.use('/api/chats', chatsRouter);
app.use('/api/estimates', estimatesRouter);

app.post('/api/logs', (req, res) => {
    const { message, data } = req.body;
    console.log(`\n=== [AI LOG] ${message} ===`);
    if (data) console.log(JSON.stringify(data, null, 2));
    res.sendStatus(200);
});

/**
 * GET /api/prices
 * Query cached pricing data
 * Query params: serviceName, region, currency, type, productName, search, limit
 */
app.get('/api/prices', async (req, res) => {
    try {
        const {
            serviceName,
            region,
            currency = 'USD',
            type,
            productName,
            skuName,
            search: searchText,
            limit,
        } = req.query;

        // Build a cache key from all significant query params
        const cacheKey = `prices:${serviceName}:${region}:${currency}:${type}:${productName}:${skuName}:${searchText}:${limit}`;
        const cached = serverCacheGet(cacheKey);
        if (cached) {
            res.set('X-Cache', 'HIT');
            res.set('Cache-Control', 'public, max-age=900');
            return res.json(cached);
        }

        console.log(`[API] /prices requested - service: ${serviceName}, region: ${region}, search: "${searchText || ''}"`);

        const queryLimit = limit === 'all' ? 'all' : (parseInt(limit) || 200);

        const items = await queryPrices({
            serviceName,
            armRegionName: region,
            currencyCode: currency,
            type,
            productName,
            skuName,
            search: searchText,
            limit: queryLimit,
        });

        const response = { Items: items, Count: items.length, currency };
        serverCacheSet(cacheKey, response);
        res.set('X-Cache', 'MISS');
        res.set('Cache-Control', 'public, max-age=900');
        res.json(response);
    } catch (err) {
        console.error('Query error:', err);
        res.status(500).json({ error: 'Failed to query prices', message: err.message });
    }
});

/**
 * GET /api/prices/search
 * Text search across product names, SKUs, meters
 */
app.get('/api/prices/search', async (req, res) => {
    try {
        const { q, region, currency = 'USD', limit = 100 } = req.query;

        console.log(`[API] /prices/search requested - q: "${q}", region: ${region}`);

        if (!q) {
            return res.status(400).json({ error: 'Query parameter "q" is required' });
        }

        const items = await queryPrices({
            search: q,
            armRegionName: region,
            currencyCode: currency,
            limit: Math.min(parseInt(limit) || 100, 500),
        });

        res.json({
            Items: items,
            Count: items.length,
            currency,
        });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: 'Search failed', message: err.message });
    }
});

/**
 * POST /api/sync
 * Trigger a manual full sync
 */
app.post('/api/sync', async (req, res) => {
    try {
        res.json({ message: 'Sync started', status: 'running' });
        // Run in background
        runFullSync().catch(err => console.error('Manual sync error:', err));
    } catch (err) {
        res.status(500).json({ error: 'Sync failed to start', message: err.message });
    }
});

/**
 * POST /api/sync/quick
 * Quick sync — just eastus USD, 5 popular services
 */
app.post('/api/sync/quick', async (req, res) => {
    try {
        const result = await runQuickSync();
        res.json({ message: 'Quick sync complete', ...result });
    } catch (err) {
        res.status(500).json({ error: 'Quick sync failed', message: err.message });
    }
});

/**
 * GET /api/best-vm-prices
 * Returns map of SKU -> { minPrice, region } for comparison
 */
app.get('/api/best-vm-prices', async (req, res) => {
    try {
        const { currency = 'USD' } = req.query;

        const cacheKey = `best-vm-prices:${currency}`;
        const cached = serverCacheGet(cacheKey);
        if (cached) {
            res.set('X-Cache', 'HIT');
            res.set('Cache-Control', 'public, max-age=900');
            return res.json(cached);
        }

        const prices = await getBestVmPrices(currency);
        const response = {
            count: prices.length,
            currency,
            items: prices
        };

        serverCacheSet(cacheKey, response);
        res.set('X-Cache', 'MISS');
        res.set('Cache-Control', 'public, max-age=900');
        res.json(response);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch best prices', message: err.message });
    }
});

/**
 * GET /api/vm-compare
 * Returns all regional prices for selected SKUs.
 * Params: skus (comma-separated), currency, os (linux|windows)
 */
app.get('/api/vm-compare', async (req, res) => {
    try {
        const { skus, currency = 'USD', os = 'linux' } = req.query;
        if (!skus) return res.status(400).json({ error: 'skus parameter required' });

        const cacheKey = `vm-compare:${skus}:${currency}:${os}`;
        const cached = serverCacheGet(cacheKey);
        if (cached) { res.set('X-Cache', 'HIT'); return res.json(cached); }

        const skuList = skus.split(',').map(s => s.trim()).filter(Boolean).slice(0, 2);
        const { query } = await import('./db.js');

        const rateRes = await query('SELECT rate_from_usd FROM currency_rates WHERE currency_code = $1', [currency]);
        const rate = rateRes.rows.length > 0 ? rateRes.rows[0].rate_from_usd : 1.0;

        const osFilter = os === 'windows'
            ? `AND product_name ILIKE '%Windows%'`
            : `AND product_name NOT ILIKE '%Windows%' AND product_name NOT ILIKE '%Spot%' AND product_name NOT ILIKE '%Low Priority%'`;

        const results = {};
        for (const sku of skuList) {
            const sqlRegional = `
                SELECT arm_region_name, location, MIN(retail_price) as price
                FROM azure_prices
                WHERE service_name = 'Virtual Machines'
                  AND type = 'Consumption'
                  AND currency_code = 'USD'
                  AND is_active = TRUE
                  AND sku_name = $1
                  AND retail_price > 0
                  ${osFilter}
                GROUP BY arm_region_name, location
                ORDER BY arm_region_name ASC
            `;
            const r = await query(sqlRegional, [sku]);
            results[sku] = r.rows.map(row => ({
                region: row.arm_region_name,
                location: row.location,
                price: row.price * rate,
            }));
        }

        const response = { currency, os, skus: skuList, regions: results };
        serverCacheSet(cacheKey, response);
        res.set('X-Cache', 'MISS');
        res.json(response);
    } catch (err) {
        console.error('VM compare error:', err);
        res.status(500).json({ error: 'Failed to fetch comparison data', message: err.message });
    }
});



/**
 * GET /api/health
 * Server health + last sync info
 */
app.get('/api/health', async (req, res) => {
    try {
        const lastSync = await getLastSync();
        const totalPrices = await getPriceCount();

        res.json({
            status: 'ok',
            uptime: process.uptime(),
            totalPrices,
            lastSync: lastSync ? {
                startedAt: lastSync.started_at,
                completedAt: lastSync.completed_at,
                itemsSynced: lastSync.items_synced,
                status: lastSync.status,
            } : null,
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ── Startup ─────────────────────────────────────
async function start() {
    console.log('🚀 Azure Pricing Backend');
    console.log('─'.repeat(40));

    // Check Database config
    if (!process.env.DATABASE_URL) {
        console.error('❌ Missing DATABASE_URL in .env');
        console.error('   See .env.example for setup instructions');
        process.exit(1);
    }

    // Init database
    await initDB();

    // Start automated daily sync (Midnight)
    initScheduler();

    // Initial sync is now manual (see backend/scripts/populate_db.py)
    // console.log('⚡ Triggering initial quick sync...');
    // runQuickSync().catch(err => console.error('Startup sync error:', err));

    // Start server
    app.listen(PORT, () => {
        console.log(`🌐 Server running on http://localhost:${PORT}`);
        console.log(`   GET  /api/prices?serviceName=...&region=...&currency=...`);
        console.log(`   GET  /api/prices/search?q=...`);
        console.log(`   POST /api/sync          (full sync)`);
        console.log(`   POST /api/sync/quick    (quick sync)`);
        console.log(`   GET  /api/health`);
        console.log('─'.repeat(40));
    });
}
/**
 * GET /api/vms
 * ─────────────────────────────────────────────────────────────────
 * Hybrid endpoint: PostgreSQL for live prices + in-memory JSON for
 * hardware specs. Applies currency conversion at request time.
 *
 * Query params:
 *   region   – Azure arm region code  (default: eastus)
 *   currency – ISO 4217 code          (default: USD)
 *   search   – Optional SKU name filter (substring, case-insensitive)
 *   limit    – Max rows returned      (default: 100, max: 500)
 *   offset   – Pagination offset      (default: 0)
 *
 * Response shape (per SKU):
 *   {
 *     skuName       : "Standard_D4s_v3",
 *     region        : "eastus",
 *     currency      : "INR",
 *     linuxPrice    : 14.23,       // per hour, converted
 *     windowsPrice  : 21.10,
 *     specs: {
 *       vCpus         : 4,
 *       memoryGib     : 16,
 *       type          : "General Purpose",
 *       architecture  : "x64",
 *       hyperVGen     : "V1/V2",
 *       acus          : 160,
 *       gpus          : 0,
 *       maxNics       : 2,
 *       rdmaEnabled   : false,
 *       acceleratedNet: true,
 *       osDiskSizeGib : 1023,
 *       resDiskSizeGib: 32,
 *       maxDataDisks  : 8,
 *       premiumDisk   : true,
 *       uncachedIops  : 6400,
 *       uncachedMbps  : 96
 *     }
 *   }
 */
app.get('/api/vm-list', async (req, res) => {
    try {
        const {
            currency = 'USD',
            region = 'eastus',
            limit = 100,
            offset = 0,
            search = '',
            minVcpu, maxVcpu,
            minMemory, maxMemory
        } = req.query;

        // Check server-side cache first
        const cacheKey = `vm-list:${region}:${currency}:${search}:${limit}:${offset}:${minVcpu}:${maxVcpu}:${minMemory}:${maxMemory}`;
        const cached = serverCacheGet(cacheKey);
        if (cached) {
            res.set('X-Cache', 'HIT');
            res.set('Cache-Control', 'public, max-age=900');
            return res.json(cached);
        }

        console.log(`[API] /vm-list requested - search: "${search}", region: ${region}`);

        const safeLimit = Math.max(1, parseInt(limit) || 100);
        const safeOffset = Math.max(0, parseInt(offset) || 0);

        const { query } = await import('./db.js');

        // ── In-memory currency cache (5-min TTL) ─────────────────────
        const CURRENCY_CACHE = app._currencyCache || (app._currencyCache = new Map());
        const cacheKeyC = currency.toUpperCase();
        const cachedC = CURRENCY_CACHE.get(cacheKeyC);
        let rate = 1.0;
        if (cacheKeyC === 'USD') {
            rate = 1.0;
        } else if (cachedC && Date.now() - cachedC.ts < 5 * 60 * 1000) {
            rate = cachedC.rate;
        } else {
            const rateResult = await query(
                `SELECT rate_from_usd FROM currency_rates WHERE currency_code = $1`,
                [cacheKeyC]
            );
            if (rateResult.rows.length === 0) {
                return res.status(400).json({
                    error: `Currency '${currency}' not found in currency_rates table`,
                });
            }
            rate = parseFloat(rateResult.rows[0].rate_from_usd);
            CURRENCY_CACHE.set(cacheKeyC, { rate, ts: Date.now() });
        }

        const args = [region];
        let paramIdx = 2;

        let searchClause = '';
        if (search && search.trim()) {
            let searchTerm = search.trim();
            if (searchTerm.toLowerCase().startsWith('standard_')) {
                searchTerm = searchTerm.substring(9);
            } else if (searchTerm.toLowerCase().startsWith('basic_')) {
                searchTerm = searchTerm.substring(6);
            }
            searchTerm = searchTerm.replace(/_/g, ' ');
            searchClause = `AND LOWER(sku_name) LIKE $${paramIdx}`;
            args.push(`%${searchTerm.toLowerCase()}%`);
            paramIdx++;
        }

        const sql = `
            WITH all_skus AS (
                SELECT DISTINCT sku_name
                FROM azure_prices
                WHERE
                    currency_code = 'USD'
                    AND is_active = TRUE
                    AND service_name = 'Virtual Machines'
                    AND type = 'Consumption'
                    AND LOWER(sku_name) NOT LIKE '%spot%'
                    AND LOWER(sku_name) NOT LIKE '%low priority%'
                    ${searchClause}
            )
            SELECT
                CONCAT('Standard_', REPLACE(TRIM(a.sku_name), ' ', '_')) AS sku_key,
                a.sku_name                                                AS raw_sku,
                MIN(CASE WHEN LOWER(p.product_name) NOT LIKE '%windows%'
                         THEN p.retail_price END)                         AS linux_usd,
                MIN(CASE WHEN LOWER(p.product_name) LIKE '%windows%'
                         THEN p.retail_price END)                         AS windows_usd
            FROM all_skus a
            LEFT JOIN azure_prices p
                ON p.sku_name = a.sku_name
                AND p.arm_region_name = $1
                AND p.currency_code = 'USD'
                AND p.is_active = TRUE
                AND p.service_name = 'Virtual Machines'
                AND p.type = 'Consumption'
            GROUP BY a.sku_name
            ORDER BY a.sku_name ASC
        `;

        const result = await query(sql, args);

        const items = result.rows.map(row => {
            const skuName = row.sku_key;
            const linuxPrice = row.linux_usd != null ? +(row.linux_usd * rate).toFixed(6) : null;
            const windowsPrice = row.windows_usd != null ? +(row.windows_usd * rate).toFixed(6) : null;
            return { skuName, region, currency: currency.toUpperCase(), linuxPrice, windowsPrice, specs: null };
        });

        const paginatedItems = items.slice(safeOffset, Math.min(items.length, safeOffset + safeLimit));

        const response = {
            region,
            currency: currency.toUpperCase(),
            exchangeRate: rate,
            specsLoaded: 0,
            count: items.length,
            limit: safeLimit,
            offset: safeOffset,
            items: paginatedItems
        };

        serverCacheSet(cacheKey, response);
        res.set('X-Cache', 'MISS');
        res.set('Cache-Control', 'public, max-age=900');
        res.json(response);

    } catch (err) {
        console.error('[/api/vm-list] Error:', err);
        res.status(500).json({ error: 'Failed to fetch VM list', message: err.message });
    }
});

/**
 * POST /api/vms/compare
 * Returns pricing for specific SKUs across specified regions
 */
app.post('/api/vms/compare', async (req, res) => {
    try {
        const { skus = [], regions = ['centralindia', 'southindia'], currency = 'USD' } = req.body;

        if (!skus.length) return res.json({ items: [], currency, skus, regions });

        const cacheKey = `vms-compare:${skus.sort().join(',')}:${regions.sort().join(',')}:${currency}`;
        const cached = serverCacheGet(cacheKey);
        if (cached) { res.set('X-Cache', 'HIT'); return res.json(cached); }

        const { query } = await import('./db.js');

        const rateRes = await query('SELECT rate_from_usd FROM currency_rates WHERE currency_code = $1', [currency]);
        const rate = rateRes.rows.length > 0 ? rateRes.rows[0].rate_from_usd : 1.0;

        const placeholders = skus.map((_, i) => `$${i + 1}`).join(',');
        const regionPlaceholders = regions.map((_, i) => `$${skus.length + 1 + i}`).join(',');

        const sql = `
            SELECT 
                arm_region_name as region,
                CONCAT('Standard_', REPLACE(sku_name, ' ', '_')) as sku,
                MIN(CASE WHEN product_name NOT ILIKE '%Windows%' THEN retail_price END) as linux_price,
                MIN(CASE WHEN product_name ILIKE '%Windows%' THEN retail_price END) as windows_price
            FROM azure_prices
            WHERE service_name = 'Virtual Machines'
              AND type = 'Consumption'
              AND currency_code = 'USD'
              AND is_active = TRUE
              AND product_name NOT ILIKE '%Spot%'
              AND product_name NOT ILIKE '%Low Priority%'
              AND sku_name NOT ILIKE '%Spot%'
              AND sku_name NOT ILIKE '%Low Priority%'
              AND CONCAT('Standard_', REPLACE(sku_name, ' ', '_')) IN (${placeholders})
              AND arm_region_name IN (${regionPlaceholders})
            GROUP BY arm_region_name, sku_name
        `;

        const result = await query(sql, [...skus, ...regions]);

        const byRegion = {};
        for (const r of regions) byRegion[r] = { region: r };

        for (const row of result.rows) {
            const reg = row.region;
            const sku = row.sku;
            if (!byRegion[reg]) byRegion[reg] = { region: reg };
            byRegion[reg][sku] = {
                linuxPrice: row.linux_price ? row.linux_price * rate : null,
                windowsPrice: row.windows_price ? row.windows_price * rate : null
            };
        }

        const response = { items: Object.values(byRegion), currency, skus, regions };
        serverCacheSet(cacheKey, response);
        res.set('X-Cache', 'MISS');
        res.json(response);

    } catch (err) {
        console.error('Compare pricing error:', err);
        res.status(500).json({ error: 'Comparison failed', message: err.message });
    }
});

// ── Saved Quotations / Estimates handling mapped to estimatesRouter ──


/**
 * DELETE /api/estimates/:id
 */
app.delete('/api/estimates/:id', authenticateToken, async (req, res) => {
    try {
        const { query } = await import('./db.js');
        await query(`DELETE FROM estimates WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id]);
        res.json({ ok: true });
    } catch (err) {
        console.error('Delete estimate error:', err);
        res.status(500).json({ error: 'Failed to delete estimate' });
    }
});

// ── Startup ─────────────────────────────────────────────────────────
start().catch(err => {
    console.error('Fatal startup error:', err);
    process.exit(1);
});


