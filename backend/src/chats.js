import express from 'express';
import { query } from './db.js';
import { authenticateToken } from './auth.js';

const router = express.Router();

// Apply auth middleware to all chat routes
router.use(authenticateToken);

/**
 * GET /api/chats
 * Returns all chats for the logged-in user (summary only, no full messages to save bandwidth)
 */
router.get('/', async (req, res) => {
    try {
        const result = await query(
            `SELECT id, title, created_at, updated_at,
                    jsonb_array_length(messages) AS message_count
             FROM ai_chats
             WHERE user_id = $1
             ORDER BY updated_at DESC`,
            [req.user.id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Get chats error:', err);
        res.status(500).json({ error: 'Failed to fetch chats' });
    }
});

/**
 * POST /api/chats
 * Create a new chat session
 */
router.post('/', async (req, res) => {
    try {
        const { title, messages } = req.body;
        if (!title) return res.status(400).json({ error: 'title is required' });
        if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages array is required' });

        const result = await query(
            `INSERT INTO ai_chats (user_id, title, messages)
             VALUES ($1, $2, $3::jsonb)
             RETURNING id, title, messages, created_at, updated_at`,
            [req.user.id, title.trim(), JSON.stringify(messages)]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Create chat error:', err);
        res.status(500).json({ error: 'Failed to create chat' });
    }
});

/**
 * GET /api/chats/:id
 * Returns a single chat including full messages array
 */
router.get('/:id', async (req, res) => {
    try {
        const result = await query(
            `SELECT * FROM ai_chats WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!result.rows[0]) return res.status(404).json({ error: 'Chat not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Get chat error:', err);
        res.status(500).json({ error: 'Failed to fetch chat' });
    }
});

/**
 * PUT /api/chats/:id
 * Update (rename or append messages) an existing chat
 */
router.put('/:id', async (req, res) => {
    try {
        const { title, messages } = req.body;
        const result = await query(
            `UPDATE ai_chats
             SET title = COALESCE($1, title),
                 messages = COALESCE($2::jsonb, messages),
                 updated_at = NOW()
             WHERE id = $3 AND user_id = $4
             RETURNING id, title, messages, updated_at`,
            [
                title ? title.trim() : null,
                messages ? JSON.stringify(messages) : null,
                req.params.id,
                req.user.id
            ]
        );
        if (!result.rows[0]) return res.status(404).json({ error: 'Chat not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Update chat error:', err);
        res.status(500).json({ error: 'Failed to update chat' });
    }
});

/**
 * DELETE /api/chats/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        await query(`DELETE FROM ai_chats WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id]);
        res.json({ ok: true });
    } catch (err) {
        console.error('Delete chat error:', err);
        res.status(500).json({ error: 'Failed to delete chat' });
    }
});

export default router;
