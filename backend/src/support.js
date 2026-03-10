/**
 * Support Routes
 *
 * POST /api/support              – submit a ticket (guests + auth users)
 * GET  /api/support/my-tickets   – list tickets for the logged-in user
 *
 * Required env vars (optional – email sending):
 *   EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM
 *   (or use Resend: RESEND_API_KEY)
 */

import express from 'express';
import nodemailer from 'nodemailer';
import { query } from './db.js';
import { authenticateToken } from './auth.js';

const router = express.Router();

// ── Nodemailer transporter ────────────────────────────────────────────────
function createTransporter() {
    if (!process.env.EMAIL_HOST) return null;
    return nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: process.env.EMAIL_PORT === '465',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
}

async function sendConfirmationEmail(to, name, ticketId, subject) {
    const transporter = createTransporter();
    if (!transporter) return; // Email not configured — skip silently

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM || '"Azure Pricing Support" <support@azurepricing.app>',
            to,
            subject: `[Ticket #${ticketId}] We received your request: ${subject}`,
            html: `
                <p>Hi ${name},</p>
                <p>Thank you for reaching out! We have received your support request.</p>
                <p><strong>Ticket ID:</strong> #${ticketId}<br/>
                <strong>Subject:</strong> ${subject}</p>
                <p>Our team will review your message and get back to you as soon as possible.</p>
                <p>You can track your ticket status by visiting the <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/support">Support page</a>.</p>
                <br/>
                <p>Thanks,<br/>Azure Pricing Calculator Support Team</p>
            `,
        });
    } catch (err) {
        console.warn('[support] Email send failed (non-fatal):', err.message);
    }
}

// ── POST /api/support ─────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;
        if (!name || !email || !subject || !message) {
            return res.status(400).json({ error: 'name, email, subject, and message are required' });
        }

        // Optionally link to a logged-in user
        let userId = null;
        const authHeader = req.headers['authorization'];
        if (authHeader) {
            try {
                const { authenticateToken: _at } = await import('./auth.js');
                // Try to decode silently — don't block on auth failure
                const { query: q } = await import('./db.js');
                const { default: admin } = await import('firebase-admin');
                const idToken = authHeader.split(' ')[1];
                if (idToken) {
                    const decoded = await admin.auth().verifyIdToken(idToken);
                    const userRes = await q('SELECT id FROM users WHERE firebase_uid = $1', [decoded.uid]);
                    userId = userRes.rows[0]?.id || null;
                }
            } catch {
                // Not authenticated — that's fine, guests can submit tickets
            }
        }

        const result = await query(
            `INSERT INTO support_tickets (user_id, name, email, subject, message, status)
             VALUES ($1, $2, $3, $4, $5, 'open')
             RETURNING id, created_at`,
            [userId, name.trim(), email.trim(), subject.trim(), message.trim()]
        );

        const ticket = result.rows[0];
        await sendConfirmationEmail(email, name, ticket.id, subject);

        res.json({
            success: true,
            ticketId: ticket.id,
            message: `Your ticket #${ticket.id} has been submitted. We'll be in touch soon.`,
        });
    } catch (err) {
        console.error('[support/create] Error:', err);
        res.status(500).json({ error: 'Failed to submit support ticket' });
    }
});

// ── GET /api/support/my-tickets ───────────────────────────────────────────
router.get('/my-tickets', authenticateToken, async (req, res) => {
    try {
        const result = await query(
            `SELECT id, subject, message, status, admin_reply, created_at, updated_at
             FROM support_tickets
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [req.user.id]
        );
        res.json({ tickets: result.rows });
    } catch (err) {
        console.error('[support/my-tickets] Error:', err);
        res.status(500).json({ error: 'Failed to fetch tickets' });
    }
});

export default router;
