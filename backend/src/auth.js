import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { query } from './db.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-prod';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

/**
 * Middleware to authenticate JWT
 */
export function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

/**
 * POST /api/auth/signup
 */
router.post('/signup', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

        const hashedPassword = await bcrypt.hash(password, 10);

        try {
            const result = await query(
                `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name`,
                [email, hashedPassword, name]
            );
            const user = result.rows[0];
            const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
            res.json({
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    preferred_region: user.preferred_region,
                    preferred_currency: user.preferred_currency
                }
            });
        } catch (err) {
            if (err.code === '23505') { // Unique violation
                return res.status(409).json({ error: 'Email already registered' });
            }
            throw err;
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user || str_is_google_user(user) || !(await bcrypt.compare(password, user.password_hash || ''))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                preferred_region: user.preferred_region,
                preferred_currency: user.preferred_currency
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/auth/google
 */
router.post('/google', async (req, res) => {
    try {
        const { credential } = req.body;
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { email, name, sub: googleId } = payload;

        // Check if user exists
        let result = await query('SELECT * FROM users WHERE email = $1', [email]);
        let user = result.rows[0];

        if (!user) {
            // Create user
            result = await query(
                `INSERT INTO users (email, google_id, name) VALUES ($1, $2, $3) RETURNING id, email, name, preferred_region, preferred_currency`,
                [email, googleId, name]
            );
            user = result.rows[0];
        } else if (!user.google_id) {
            // Link Google ID to existing account if previously email/password
            await query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, user.id]);
        }

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                preferred_region: user.preferred_region,
                preferred_currency: user.preferred_currency
            }
        });

    } catch (err) {
        console.error(err);
        res.status(401).json({ error: 'Google authentication failed' });
    }
});

/**
 * PUT /api/auth/preferences
 */
router.put('/preferences', authenticateToken, async (req, res) => {
    try {
        const { region, currency } = req.body;
        const result = await query(
            `UPDATE users 
             SET preferred_region = COALESCE($1, preferred_region), 
                 preferred_currency = COALESCE($2, preferred_currency) 
             WHERE id = $3 
             RETURNING id, email, name, preferred_region, preferred_currency`,
            [region, currency, req.user.id]
        );
        const user = result.rows[0];
        res.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                preferred_region: user.preferred_region,
                preferred_currency: user.preferred_currency
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
});

function str_is_google_user(user) {
    return user.google_id && !user.password_hash;
}

export default router;
