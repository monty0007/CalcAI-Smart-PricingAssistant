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
import { query } from './db.js';
import { authenticateToken } from './auth.js';

const router = express.Router();

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

export default router;
