import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDB, queryPrices, getLastSync, getPriceCount, getBestVmPrices } from './db.js';
import { runFullSync, runQuickSync } from './sync.js';
import { initScheduler } from './scheduler.js';
import authRouter from './auth.js';
import estimatesRouter from './estimates.js';
import { lookupSpec, normalizeSkuName, specMap } from './vmSpecs.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ───────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Routes ──────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/estimates', estimatesRouter);

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

        // Allow fetching all items if limit='all' or use provided number (default 200)
        // Removing hard cap of 1000 to allow full data fetch
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

        res.json({
            Items: items,
            Count: items.length,
            currency,
        });
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
        const prices = await getBestVmPrices(currency);
        res.json({
            count: prices.length,
            currency,
            items: prices
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch best prices', message: err.message });
    }
});

/**
 * GET /api/vm-list
 * Returns grouped VM SKU rows with Linux + Windows prices, best region, and diff %.
 * Params: currency, region, search, minVcpu, maxVcpu, limit, offset
 */
app.get('/api/vm-list', async (req, res) => {
    try {
        const {
            currency = 'USD',
            region = 'eastus',
            search = '',
            limit = 100,
            offset = 0,
        } = req.query;

        const { query } = await import('./db.js');

        // Get currency rate
        const rateRes = await query('SELECT rate_from_usd FROM currency_rates WHERE currency_code = $1', [currency]);
        const rate = rateRes.rows.length > 0 ? rateRes.rows[0].rate_from_usd : 1.0;

        const args = [region];
        let paramIdx = 2;

        let searchClause = '';
        if (search) {
            searchClause = `AND (p.sku_name ILIKE $${paramIdx} OR p.product_name ILIKE $${paramIdx})`;
            args.push(`%${search}%`);
            paramIdx++;
        }

        // For each SKU in the given region, get the lowest Linux and Windows prices
        const sql = `
            WITH linux_prices AS (
                SELECT sku_name, MIN(retail_price) AS linux_price
                FROM azure_prices
                WHERE service_name = 'Virtual Machines'
                  AND type = 'Consumption'
                  AND currency_code = 'USD'
                  AND is_active = TRUE
                  AND arm_region_name = $1
                  AND retail_price > 0
                  AND product_name NOT ILIKE '%Windows%'
                  AND product_name NOT ILIKE '%Spot%'
                  AND product_name NOT ILIKE '%Low Priority%'
                  AND sku_name    NOT ILIKE '%Spot%'
                  AND sku_name    NOT ILIKE '%Low Priority%'
                  ${search ? `AND (sku_name ILIKE $${paramIdx - 1} OR product_name ILIKE $${paramIdx - 1})` : ''}
                GROUP BY sku_name
            ),
            windows_prices AS (
                SELECT sku_name, MIN(retail_price) AS windows_price
                FROM azure_prices
                WHERE service_name = 'Virtual Machines'
                  AND type = 'Consumption'
                  AND currency_code = 'USD'
                  AND is_active = TRUE
                  AND arm_region_name = $1
                  AND retail_price > 0
                  AND product_name ILIKE '%Windows%'
                  AND product_name NOT ILIKE '%Spot%'
                  AND sku_name    NOT ILIKE '%Spot%'
                  AND sku_name    NOT ILIKE '%Low Priority%'
                GROUP BY sku_name
            ),
            best_prices AS (
                SELECT sku_name,
                       MIN(retail_price) AS best_price,
                       arm_region_name AS best_region
                FROM azure_prices
                WHERE service_name = 'Virtual Machines'
                  AND type = 'Consumption'
                  AND currency_code = 'USD'
                  AND is_active = TRUE
                  AND retail_price > 0
                  AND product_name NOT ILIKE '%Windows%'
                  AND product_name NOT ILIKE '%Spot%'
                  AND sku_name    NOT ILIKE '%Spot%'
                  AND sku_name    NOT ILIKE '%Low Priority%'
                GROUP BY sku_name, arm_region_name
                ORDER BY sku_name, min(retail_price)
            ),
            lowest_region AS (
                SELECT DISTINCT ON (sku_name) sku_name, best_price, best_region
                FROM best_prices
                ORDER BY sku_name, best_price
            )
            SELECT
                l.sku_name,
                l.linux_price,
                w.windows_price,
                lr.best_price,
                lr.best_region,
                CASE WHEN l.linux_price > 0 AND lr.best_price > 0
                     THEN ROUND(((l.linux_price - lr.best_price) / l.linux_price * 100)::numeric, 1)
                     ELSE 0
                END AS diff_percent,
                -- Join vm_types for real spec data
                vt.number_of_cores,
                vt.memory_mb,
                vt.canonical_name,
                vt.cpu_architecture,
                vt.max_net_interfaces,
                vt.gpus,
                vt.support_premium_disk,
                vt.combined_iops,
                vt.uncached_disk_iops,
                vt.combined_write_bytes,
                vt.combined_read_bytes,
                vt.acus,
                vt.rdma_enabled,
                vt.accelerated_net,
                vt.hyper_v_gen,
                vt.perf_score,
                vt.max_data_disk_count,
                vt.os_disk_size_mb,
                vt.resource_disk_size_mb,
                vt.gpu_type,
                vt.gpu_ram_mb,
                vt.gpu_total_ram_mb,
                vt.similar_azure_vms
            FROM linux_prices l
            LEFT JOIN windows_prices w ON l.sku_name = w.sku_name
            LEFT JOIN lowest_region lr ON l.sku_name = lr.sku_name
            LEFT JOIN vm_types vt ON vt.name ILIKE 'Standard_' || REPLACE(l.sku_name, ' ', '_')
            ORDER BY l.sku_name ASC
            LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
        `;

        args.push(parseInt(limit) || 100, parseInt(offset) || 0);

        const result = await query(sql, args);

        // Normalize DB sku_name to Standard_ format
        // DB stores: "A0", "A1 v2", "D2s v3" etc.
        // We want: "Standard_A0", "Standard_A1_v2", "Standard_D2s_v3"
        function normalizeSkuName(rawSku) {
            if (!rawSku) return rawSku;
            // Skip if already has Standard_ prefix
            if (/^Standard_/i.test(rawSku)) return rawSku;
            // Convert spaces to underscores and prepend Standard_
            const normalized = rawSku.trim().replace(/\s+/g, '_');
            return `Standard_${normalized}`;
        }

        const rows = result.rows.map(r => ({
            skuName: normalizeSkuName(r.sku_name),
            rawSkuName: r.sku_name,
            linuxPrice: r.linux_price ? r.linux_price * rate : null,
            windowsPrice: r.windows_price ? r.windows_price * rate : null,
            bestPrice: r.best_price ? r.best_price * rate : null,
            bestRegion: r.best_region || null,
            diffPercent: parseFloat(r.diff_percent) || 0,
            // From vm_types table (null if not yet populated)
            vCpus: r.number_of_cores ?? null,
            memoryGib: r.memory_mb ? +(r.memory_mb / 1024).toFixed(2) : null,
            canonicalName: r.canonical_name || null,
            cpuArchitecture: r.cpu_architecture || null,
            maxNics: r.max_net_interfaces ?? null,
            gpus: r.gpus ?? null,
            premiumDisk: r.support_premium_disk ?? null,
            combinedIops: r.combined_iops ?? null,
            uncachedIops: r.uncached_disk_iops ?? null,
            combinedWriteBytes: r.combined_write_bytes ?? null,
            combinedReadBytes: r.combined_read_bytes ?? null,
            acus: r.acus ?? null,
            rdmaEnabled: r.rdma_enabled ?? null,
            acceleratedNet: r.accelerated_net ?? null,
            hyperVGen: r.hyper_v_gen || null,
            perfScore: r.perf_score ? parseFloat(r.perf_score) : null,
            maxDisks: r.max_data_disk_count ?? null,
            osDiskSizeMb: r.os_disk_size_mb ?? null,
            resDiskSizeMb: r.resource_disk_size_mb ?? null,
            gpuType: r.gpu_type || null,
            gpuRamMb: r.gpu_ram_mb ? parseFloat(r.gpu_ram_mb) : null,
            gpuTotalRamMb: r.gpu_total_ram_mb ? parseFloat(r.gpu_total_ram_mb) : null,
            similarVMs: r.similar_azure_vms || [],
        }));

        res.json({ currency, region, count: rows.length, items: rows });
    } catch (err) {
        console.error('VM list error:', err);
        res.status(500).json({ error: 'Failed to fetch VM list', message: err.message });
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

        res.json({ currency, os, skus: skuList, regions: results });
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

        const safeLimit = Math.max(1, parseInt(limit) || 100);
        const safeOffset = Math.max(0, parseInt(offset) || 0);

        // Fetch currency rate if neededrom DB ────────────────────────
        //    currency_rates stores rate_from_usd, e.g. INR = 83.5
        //    If currency is USD just use 1.0 (no extra query needed)
        const { query } = await import('./db.js');

        let rate = 1.0;
        if (currency.toUpperCase() !== 'USD') {
            const rateResult = await query(
                `SELECT rate_from_usd
                 FROM currency_rates
                 WHERE currency_code = $1`,
                [currency.toUpperCase()]
            );
            if (rateResult.rows.length === 0) {
                return res.status(400).json({
                    error: `Currency '${currency}' not found in currency_rates table`,
                });
            }
            rate = parseFloat(rateResult.rows[0].rate_from_usd);
        }

        // ── 2. Query base USD prices from PostgreSQL ─────────────────
        //    We aggregate Linux and Windows prices per SKU in one pass.
        //    The azure_prices table stores prices in USD (currency_code='USD').
        //    type field: 'Consumption' = pay-as-you-go
        //
        //    We identify OS by whether the product_name contains 'Windows';
        //    rows without 'Windows' in the product_name are treated as Linux.
        const args = [region];
        let paramIdx = 2;

        let searchClause = '';
        if (search && search.trim()) {
            let searchTerm = search.trim();
            // If user types 'standard_a', strip it to 'a' so it matches raw sku 'A0'
            if (searchTerm.toLowerCase().startsWith('standard_')) {
                searchTerm = searchTerm.substring(9);
            }
            searchClause = `AND p.sku_name ILIKE $${paramIdx}`;
            args.push(`%${searchTerm}%`);
            paramIdx++;
        }

        const sql = `
            SELECT
                -- Normalise DB sku_name to Standard_* format in SQL for grouping
                CONCAT('Standard_', REPLACE(TRIM(p.sku_name), ' ', '_')) AS sku_key,
                p.sku_name                                                AS raw_sku,

                -- Linux price: rows where product_name does NOT contain 'Windows'
                MIN(CASE WHEN p.product_name NOT ILIKE '%windows%'
                         THEN p.retail_price END)                         AS linux_usd,

                -- Windows price: rows where product_name contains 'Windows'
                MIN(CASE WHEN p.product_name ILIKE '%windows%'
                         THEN p.retail_price END)                         AS windows_usd

            FROM azure_prices p
            WHERE
                p.arm_region_name = $1
                AND p.currency_code = 'USD'
                AND p.is_active = TRUE
                AND p.service_name = 'Virtual Machines'
                AND p.type = 'Consumption'
                -- Exclude Spot and Low Priority entries from main list
                AND p.sku_name NOT ILIKE '%spot%'
                AND p.sku_name NOT ILIKE '%low priority%'
                ${searchClause}
            GROUP BY p.sku_name
            ORDER BY p.sku_name ASC
        `;

        const result = await query(sql, args);

        // ── 3. Merge DB rows with in-memory spec map ─────────────────
        //    O(1) per row — no additional DB query needed for specs.
        const items = result.rows.map(row => {
            // Normalise: DB may store "D4s v3" → we want "Standard_D4s_v3"
            const skuName = row.sku_key;  // already computed in SQL
            const spec = lookupSpec(skuName);  // O(1) Map lookup

            // Apply currency rate (multiply base USD price)
            const linuxPrice = row.linux_usd != null ? +(row.linux_usd * rate).toFixed(6) : null;
            const windowsPrice = row.windows_usd != null ? +(row.windows_usd * rate).toFixed(6) : null;

            return {
                skuName,
                region,
                currency: currency.toUpperCase(),

                // Prices (converted to requested currency)
                linuxPrice,
                windowsPrice,

                // Hardware specs — null fields mean "not in vm_specs.json yet"
                specs: spec ? {
                    vCpus: spec.vCpus,
                    memoryGib: spec.memoryGib,
                    type: spec.type,
                    architecture: spec.architecture,
                    hyperVGen: spec.hyperVGen,
                    acus: spec.acus,
                    gpus: spec.gpus,
                    gpuType: spec.gpuType || null,
                    gpuMemGib: spec.gpuMemGib || null,
                    maxNics: spec.maxNics,
                    rdmaEnabled: spec.rdmaEnabled,
                    acceleratedNet: spec.acceleratedNet,
                    osDiskSizeGib: spec.osDiskSizeGib,
                    resDiskSizeGib: spec.resDiskSizeGib,
                    maxDataDisks: spec.maxDataDisks,
                    premiumDisk: spec.premiumDisk,
                    uncachedIops: spec.uncachedIops,
                    uncachedMbps: spec.uncachedMbps,
                } : null
            };
        });

        // ── 3.5. Apply Hardware Filters & Paginate ─────────────────────
        let filteredItems = items;

        console.log('Query Filters:', { minVcpu, maxVcpu, minMemory, maxMemory });

        const minV = parseFloat(minVcpu);
        const maxV = parseFloat(maxVcpu);
        const minM = parseFloat(minMemory);
        const maxM = parseFloat(maxMemory);

        const hasFilter = !isNaN(minV) || !isNaN(maxV) || !isNaN(minM) || !isNaN(maxM);

        if (hasFilter) {
            filteredItems = items.filter(item => {
                const spec = item.specs;
                if (!spec) return false;

                if (!isNaN(minV) && spec.vCpus < minV) return false;
                if (!isNaN(maxV) && spec.vCpus > maxV) return false;
                if (!isNaN(minM) && spec.memoryGib < minM) return false;
                if (!isNaN(maxM) && spec.memoryGib > maxM) return false;

                return true;
            });
        }

        const paginatedItems = filteredItems.slice(safeOffset, safeOffset + safeLimit);

        // ── 4. Return Paginated Data ─────────────────────────────────
        res.json({
            region,
            currency: currency.toUpperCase(),
            exchangeRate: rate,
            specsLoaded: specMap.size,   // how many spec entries are in memory
            count: filteredItems.length,
            limit: safeLimit,
            offset: safeOffset,
            items: paginatedItems
        });

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

        const { query } = await import('./db.js');

        // Get currency rate
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

        // Group by region
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

        res.json({
            items: Object.values(byRegion),
            currency,
            skus,
            regions
        });

    } catch (err) {
        console.error('Compare pricing error:', err);
        res.status(500).json({ error: 'Comparison failed', message: err.message });
    }
});

start().catch(err => {
    console.error('Fatal startup error:', err);
    process.exit(1);
});
