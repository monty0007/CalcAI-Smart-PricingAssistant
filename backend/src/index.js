import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDB, queryPrices, getLastSync, getPriceCount, getBestVmPrices } from './db.js';
import { runFullSync, runQuickSync } from './sync.js';
import { initScheduler } from './scheduler.js';
import authRouter from './auth.js';
import estimatesRouter from './estimates.js';

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

start().catch(err => {
    console.error('Fatal startup error:', err);
    process.exit(1);
});
