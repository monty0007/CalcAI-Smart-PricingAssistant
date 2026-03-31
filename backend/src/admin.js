/**
 * Admin Routes
 * All routes protected by is_admin check.
 *
 * Routes:
 *   GET    /api/admin/users             – list all users with tier & usage
 *   PATCH  /api/admin/users/:id/tier    – change a user's subscription tier
 *   DELETE /api/admin/users/:id         – delete a user
 *   GET    /api/admin/stats             – aggregate platform stats
 *   GET    /api/admin/support           – list all support tickets
 *   PATCH  /api/admin/support/:id       – update ticket status / reply
 */

import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from './db.js';
import { authenticateToken } from './auth.js';
import { runFullSync, runQuickSync } from './sync.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Sync job store (in-memory, resets on restart) ─────────────────────────────
const syncJobs = new Map();

function newJobId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function createJob(action, label) {
    const id = newJobId();
    const job = { id, action, label, status: 'running', logs: [], startedAt: new Date(), finishedAt: null };
    syncJobs.set(id, job);
    if (syncJobs.size > 50) syncJobs.delete(syncJobs.keys().next().value);
    return job;
}

function spawnPython(scriptRelPath, job) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, scriptRelPath);
        const scriptName = path.basename(scriptRelPath);
        const cmd = process.env.PYTHON_CMD || 'python';
        function trySpawn(c) {
            const proc = spawn(c, [scriptPath], { env: process.env });
            proc.stdout.on('data', d => {
                d.toString().split('\n').filter(Boolean).forEach(line => job.logs.push(line));
            });
            proc.stderr.on('data', d => {
                d.toString().split('\n').filter(Boolean).forEach(line => job.logs.push(`[stderr] ${line}`));
            });
            proc.on('error', err => {
                if (err.code === 'ENOENT' && c === cmd && cmd !== 'python3') {
                    trySpawn('python3');
                } else {
                    reject(new Error(`Failed to start: ${err.message}`));
                }
            });
            proc.on('close', code => {
                job.logs.push(`[exit] ${scriptName} exited with code ${code}`);
                code === 0 ? resolve() : reject(new Error(`${scriptName} failed with exit code ${code}`));
            });
        }
        trySpawn(cmd);
    });
}

const SYNC_ACTION_META = {
    quick_sync:      'Quick Sync (JS)',
    full_sync:       'Full Price Sync (JS)',
    python_prices:   'Update Prices',
    python_currency: 'Update Currencies',
    python_vm_types: 'Update VM Types',
};

// Apply auth guard to all routes (password gate is handled on the frontend)
router.use(authenticateToken);

// ── GET /api/admin/users ──────────────────────────────────────────────────
router.get('/users', async (req, res) => {
    try {
        const { search = '', tier = '', page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const conditions = [];
        const args = [];
        let idx = 1;

        if (search) {
            conditions.push(`(u.email ILIKE $${idx} OR u.name ILIKE $${idx})`);
            args.push(`%${search}%`);
            idx++;
        }
        if (tier) {
            conditions.push(`u.subscription_tier = $${idx}`);
            args.push(tier);
            idx++;
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const month = new Date().toISOString().slice(0, 7);

        const sql = `
            SELECT
                u.id, u.email, u.name, u.subscription_tier, u.is_admin,
                u.subscription_start, u.subscription_end, u.created_at,
                COALESCE(ut.ai_calls, 0) AS ai_calls_this_month,
                COALESCE(ut.estimate_count, 0) AS estimates_this_month
            FROM users u
            LEFT JOIN usage_tracking ut
                ON ut.user_id = u.id AND ut.month = $${idx}
            ${where}
            ORDER BY u.created_at DESC
            LIMIT $${idx + 1} OFFSET $${idx + 2}
        `;
        args.push(month, parseInt(limit), offset);

        const countSql = `SELECT COUNT(*) FROM users u ${where}`;
        const [result, countResult] = await Promise.all([
            query(sql, args),
            query(countSql, args.slice(0, -3)), // exclude limit/offset/month args for count
        ]);

        res.json({
            users: result.rows,
            total: parseInt(countResult.rows[0].count),
            page: parseInt(page),
            limit: parseInt(limit),
        });
    } catch (err) {
        console.error('[admin/users] Error:', err);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// ── PATCH /api/admin/users/:id/tier ──────────────────────────────────────
router.patch('/users/:id/tier', async (req, res) => {
    try {
        const { tier } = req.body;
        if (!['free', 'plus', 'pro'].includes(tier)) {
            return res.status(400).json({ error: 'Invalid tier. Must be free, plus, or pro.' });
        }
        const result = await query(
            `UPDATE users SET subscription_tier = $1 WHERE id = $2 RETURNING id, email, subscription_tier`,
            [tier, req.params.id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
        res.json({ user: result.rows[0] });
    } catch (err) {
        console.error('[admin/users/tier] Error:', err);
        res.status(500).json({ error: 'Failed to update user tier' });
    }
});

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────
router.delete('/users/:id', async (req, res) => {
    try {
        if (String(req.params.id) === String(req.user.id)) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }
        const result = await query(
            'DELETE FROM users WHERE id = $1 RETURNING id, email',
            [req.params.id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
        res.json({ deleted: result.rows[0] });
    } catch (err) {
        console.error('[admin/users/delete] Error:', err);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// ── GET /api/admin/stats ─────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
    try {
        const month = new Date().toISOString().slice(0, 7);

        const [totalUsers, tierCounts, usageStats, ticketStats] = await Promise.all([
            query('SELECT COUNT(*) FROM users'),
            query(`
                SELECT subscription_tier, COUNT(*) as count
                FROM users GROUP BY subscription_tier
            `),
            query(`
                SELECT
                    COALESCE(SUM(ai_calls), 0) AS total_ai_calls,
                    COALESCE(SUM(estimate_count), 0) AS total_estimates
                FROM usage_tracking WHERE month = $1
            `, [month]),
            query(`
                SELECT
                    COUNT(*) FILTER (WHERE status = 'open') AS open_tickets,
                    COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress_tickets,
                    COUNT(*) FILTER (WHERE status = 'resolved') AS resolved_tickets,
                    COUNT(*) AS total_tickets
                FROM support_tickets
            `),
        ]);

        const tierMap = {};
        for (const row of tierCounts.rows) tierMap[row.subscription_tier] = parseInt(row.count);

        res.json({
            totalUsers: parseInt(totalUsers.rows[0].count),
            tierBreakdown: { free: tierMap.free || 0, plus: tierMap.plus || 0, pro: tierMap.pro || 0 },
            thisMonth: {
                aiCalls: parseInt(usageStats.rows[0].total_ai_calls),
                estimates: parseInt(usageStats.rows[0].total_estimates),
            },
            tickets: {
                open: parseInt(ticketStats.rows[0].open_tickets),
                inProgress: parseInt(ticketStats.rows[0].in_progress_tickets),
                resolved: parseInt(ticketStats.rows[0].resolved_tickets),
                total: parseInt(ticketStats.rows[0].total_tickets),
            },
        });
    } catch (err) {
        console.error('[admin/stats] Error:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ── GET /api/admin/support ────────────────────────────────────────────────
router.get('/support', async (req, res) => {
    try {
        const { status = '', page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const args = [];
        let idx = 1;
        const where = status ? `WHERE st.status = $${idx++}` : '';
        if (status) args.push(status);

        const sql = `
            SELECT st.*, u.email AS user_email
            FROM support_tickets st
            LEFT JOIN users u ON u.id = st.user_id
            ${where}
            ORDER BY st.created_at DESC
            LIMIT $${idx} OFFSET $${idx + 1}
        `;
        args.push(parseInt(limit), offset);

        const result = await query(sql, args);
        res.json({ tickets: result.rows });
    } catch (err) {
        console.error('[admin/support] Error:', err);
        res.status(500).json({ error: 'Failed to fetch support tickets' });
    }
});

// ── PATCH /api/admin/support/:id ─────────────────────────────────────────
router.patch('/support/:id', async (req, res) => {
    try {
        const { status, admin_reply } = req.body;
        const validStatuses = ['open', 'in_progress', 'resolved'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const result = await query(
            `UPDATE support_tickets
             SET status = COALESCE($1, status),
                 admin_reply = COALESCE($2, admin_reply),
                 updated_at = NOW()
             WHERE id = $3
             RETURNING *`,
            [status || null, admin_reply || null, req.params.id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Ticket not found' });
        res.json({ ticket: result.rows[0] });
    } catch (err) {
        console.error('[admin/support/patch] Error:', err);
        res.status(500).json({ error: 'Failed to update ticket' });
    }
});

// ── POST /api/admin/sync/run ─────────────────────────────────────────────────
router.post('/sync/run', async (req, res) => {
    const { action } = req.body;
    if (!SYNC_ACTION_META[action]) {
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
    const label = SYNC_ACTION_META[action];
    const job = createJob(action, label);
    res.json({ jobId: job.id, status: 'running' });

    // Fire-and-forget — response already sent above
    (async () => {
        try {
            job.logs.push(`[start] ${label} started at ${job.startedAt.toISOString()}`);
            if (action === 'quick_sync') {
                job.logs.push('[info] Running JS quick sync...');
                await runQuickSync();
                job.logs.push('[done] Quick sync complete.');
            } else if (action === 'full_sync') {
                job.logs.push('[info] Running JS full sync (this may take 30+ min)...');
                await runFullSync();
                job.logs.push('[done] Full sync complete.');
            } else if (action === 'python_prices') {
                await spawnPython('../scripts/update_prices.py', job);
            } else if (action === 'python_currency') {
                await spawnPython('../scripts/update_currency_rates.py', job);
            } else if (action === 'python_vm_types') {
                await spawnPython('../scripts/update_vm_types.py', job);
            }
            job.status = 'completed';
        } catch (err) {
            job.logs.push(`[error] ${err.message}`);
            job.status = 'failed';
        } finally {
            job.finishedAt = new Date();
        }
    })();
});

// ── GET /api/admin/sync/jobs ──────────────────────────────────────────────────
router.get('/sync/jobs', (req, res) => {
    const jobs = Array.from(syncJobs.values())
        .sort((a, b) => b.startedAt - a.startedAt)
        .slice(0, 20)
        .map(j => ({
            id: j.id, action: j.action, label: j.label,
            status: j.status, startedAt: j.startedAt, finishedAt: j.finishedAt,
            logCount: j.logs.length,
        }));
    res.json({ jobs });
});

// ── GET /api/admin/sync/job/:id ───────────────────────────────────────────────
router.get('/sync/job/:id', (req, res) => {
    const job = syncJobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({
        id: job.id, action: job.action, label: job.label,
        status: job.status, logs: job.logs,
        startedAt: job.startedAt, finishedAt: job.finishedAt,
    });
});

// ── GET /api/admin/sync/stats — current DB data status ───────────────────────
router.get('/sync/stats', async (req, res) => {
    try {
        const [priceStats, currencyRates, vmStats] = await Promise.all([
            query(`
                SELECT COUNT(*) AS total_prices,
                       COUNT(*) FILTER (WHERE is_active = true) AS active_prices,
                       MAX(created_at) AS last_price_update
                FROM azure_prices
            `).catch(() => ({ rows: [{}] })),
            query(`
                SELECT currency_code, rate_from_usd, last_updated
                FROM currency_rates ORDER BY currency_code
            `).catch(() => ({ rows: [] })),
            query(`
                SELECT COUNT(*) AS total_vms, MAX(updated_at) AS last_vm_update
                FROM vm_types
            `).catch(() => ({ rows: [{}] })),
        ]);
        res.json({
            prices: {
                total:       parseInt(priceStats.rows[0]?.total_prices  || 0),
                active:      parseInt(priceStats.rows[0]?.active_prices || 0),
                lastUpdated: priceStats.rows[0]?.last_price_update || null,
            },
            currencies: currencyRates.rows,
            vmTypes: {
                total:       parseInt(vmStats.rows[0]?.total_vms     || 0),
                lastUpdated: vmStats.rows[0]?.last_vm_update || null,
            },
        });
    } catch (err) {
        console.error('[admin/sync/stats]', err);
        res.status(500).json({ error: 'Failed to fetch sync stats' });
    }
});

export default router;
