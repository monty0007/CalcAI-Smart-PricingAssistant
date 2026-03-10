import express from 'express';
import admin from 'firebase-admin';
import { query } from './db.js';

const router = express.Router();

// ── Firebase Admin Init ────────────────────────────────────────────────
// Initialize only once (guard against hot-reload double-init)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            // Vite/dotenv escapes \n in the key — normalize it here
            privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        }),
    });
}

// ── authenticateToken Middleware ──────────────────────────────────────
// Verifies the Firebase ID token sent as "Authorization: Bearer <token>"
export async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const idToken = authHeader && authHeader.split(' ')[1];

    if (!idToken) return res.sendStatus(401);

    try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        // decoded.uid = Firebase UID, decoded.email = user's email
        // We look up the internal DB user_id to keep all FK references consistent
        const result = await query(
            'SELECT id, email, name, preferred_region, preferred_currency, is_admin, subscription_tier FROM users WHERE firebase_uid = $1',
            [decoded.uid]
        );
        if (result.rows.length === 0) {
            // User exists in Firebase but hasn't synced to DB yet — return 401
            // The frontend's AuthContext will call /api/auth/firebase to upsert them first
            return res.status(401).json({ error: 'User not synced. Please sign in again.' });
        }
        req.user = { ...result.rows[0], uid: decoded.uid };
        next();
    } catch (err) {
        console.error('Firebase token verification failed:', err.code || err.message);
        return res.sendStatus(403);
    }
}

// ── POST /api/auth/firebase ───────────────────────────────────────────
// Called by the frontend after every Firebase sign-in to upsert the user
// in our PostgreSQL DB and return stored preferences.
router.post('/firebase', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const idToken = authHeader && authHeader.split(' ')[1];
    if (!idToken) return res.sendStatus(401);

    try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        const { uid, email } = decoded;
        const { name } = req.body;

        // Add firebase_uid column if it doesn't exist yet (safe migration)
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid TEXT UNIQUE;`);

        // Upsert: if the user already exists by firebase_uid, update their info.
        //         If they're new, insert them.
        const result = await query(
            `INSERT INTO users (email, name, firebase_uid)
             VALUES ($1, $2, $3)
             ON CONFLICT (firebase_uid) DO UPDATE
               SET email = EXCLUDED.email,
                   name  = COALESCE(users.name, EXCLUDED.name)
             RETURNING id, email, name, preferred_region, preferred_currency, is_admin, subscription_tier`,
            [email, name || email, uid]
        );

        res.json({ user: result.rows[0] });
    } catch (err) {
        console.error('Firebase sync error:', err);
        res.status(500).json({ error: 'Failed to sync user' });
    }
});

// ── PUT /api/auth/preferences ─────────────────────────────────────────
router.put('/preferences', authenticateToken, async (req, res) => {
    try {
        const { region, currency } = req.body;
        const result = await query(
            `UPDATE users
             SET preferred_region   = COALESCE($1, preferred_region),
                 preferred_currency = COALESCE($2, preferred_currency)
             WHERE id = $3
             RETURNING id, email, name, preferred_region, preferred_currency, is_admin, subscription_tier`,
            [region, currency, req.user.id]
        );
        res.json({ user: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
});

export default router;
