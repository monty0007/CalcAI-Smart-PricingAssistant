import express from 'express';
import { query } from './db.js';
import { authenticateToken } from './auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/estimates
 * List all estimates for the user
 */
router.get('/', async (req, res) => {
    try {
        const result = await query(
            'SELECT id, name, total_cost, currency, created_at, updated_at FROM estimates WHERE user_id = $1 ORDER BY updated_at DESC',
            [req.user.id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch estimates' });
    }
});

/**
 * GET /api/estimates/:id
 * Get a specific estimate
 */
router.get('/:id', async (req, res) => {
    try {
        const result = await query(
            'SELECT * FROM estimates WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Estimate not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch estimate' });
    }
});

/**
 * POST /api/estimates
 * Create a new estimate
 */
router.post('/', async (req, res) => {
    try {
        const { name, items, totalCost, currency } = req.body;
        if (!name || !items) return res.status(400).json({ error: 'Name and items required' });

        const result = await query(
            `INSERT INTO estimates (user_id, name, items, total_cost, currency) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING id, name, total_cost, currency, created_at`,
            [req.user.id, name, JSON.stringify(items), totalCost, currency]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save estimate' });
    }
});

/**
 * PUT /api/estimates/:id
 * Update an estimate
 */
router.put('/:id', async (req, res) => {
    try {
        const { name, items, totalCost, currency } = req.body;
        const result = await query(
            `UPDATE estimates 
             SET name = COALESCE($1, name), 
                 items = COALESCE($2, items), 
                 total_cost = COALESCE($3, total_cost), 
                 currency = COALESCE($4, currency),
                 updated_at = NOW()
             WHERE id = $5 AND user_id = $6
             RETURNING *`,
            [name, items ? JSON.stringify(items) : null, totalCost, currency, req.params.id, req.user.id]
        );

        if (result.rows.length === 0) return res.status(404).json({ error: 'Estimate not found or unauthorized' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update estimate' });
    }
});

/**
 * DELETE /api/estimates/:id
 * Delete an estimate
 */
router.delete('/:id', async (req, res) => {
    try {
        const result = await query(
            'DELETE FROM estimates WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Estimate not found or unauthorized' });
        res.json({ message: 'Estimate deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete estimate' });
    }
});

export default router;
