/**
 * Subscription Routes
 * Handles Stripe checkout, customer portal, webhooks, and plan queries.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET
 *   STRIPE_PLUS_PRICE_ID
 *   STRIPE_PRO_PRICE_ID
 *   FRONTEND_URL  (e.g. http://localhost:5173)
 */

import express from 'express';
import Stripe from 'stripe';
import { query } from './db.js';
import { authenticateToken } from './auth.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

const PRICE_TO_TIER = {
    [process.env.STRIPE_PLUS_PRICE_ID]: 'plus',
    [process.env.STRIPE_PRO_PRICE_ID]: 'pro',
};

const TIER_TO_PRICE = {
    plus: process.env.STRIPE_PLUS_PRICE_ID,
    pro: process.env.STRIPE_PRO_PRICE_ID,
};

// ── GET /api/subscriptions/me ─────────────────────────────────────────────
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const result = await query(
            `SELECT subscription_tier, subscription_start, subscription_end,
                    stripe_customer_id, email, name
             FROM users WHERE id = $1`,
            [req.user.id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'User not found' });

        const user = result.rows[0];

        // Fetch current month usage
        const month = new Date().toISOString().slice(0, 7);
        const usageRes = await query(
            'SELECT ai_calls, estimate_count FROM usage_tracking WHERE user_id = $1 AND month = $2',
            [req.user.id, month]
        );
        const usage = usageRes.rows[0] || { ai_calls: 0, estimate_count: 0 };

        res.json({
            tier: user.subscription_tier || 'free',
            subscriptionStart: user.subscription_start,
            subscriptionEnd: user.subscription_end,
            stripeCustomerId: user.stripe_customer_id,
            usage,
        });
    } catch (err) {
        console.error('[subscriptions/me] Error:', err);
        res.status(500).json({ error: 'Failed to fetch subscription info' });
    }
});

// ── POST /api/subscriptions/checkout ─────────────────────────────────────
// Creates a Stripe Checkout session and returns the URL
router.post('/checkout', authenticateToken, async (req, res) => {
    try {
        const { tier } = req.body; // 'plus' or 'pro'
        if (!TIER_TO_PRICE[tier]) return res.status(400).json({ error: 'Invalid tier' });

        const userRes = await query(
            'SELECT email, stripe_customer_id FROM users WHERE id = $1',
            [req.user.id]
        );
        const user = userRes.rows[0];

        let customerId = user?.stripe_customer_id;
        if (!customerId) {
            const customer = await stripe.customers.create({ email: user.email });
            customerId = customer.id;
            await query(
                'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
                [customerId, req.user.id]
            );
        }

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: customerId,
            line_items: [{ price: TIER_TO_PRICE[tier], quantity: 1 }],
            success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/billing?success=1`,
            cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/pricing`,
            metadata: { userId: String(req.user.id), tier },
        });

        res.json({ url: session.url });
    } catch (err) {
        console.error('[subscriptions/checkout] Error:', err);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

// ── POST /api/subscriptions/portal ───────────────────────────────────────
// Opens the Stripe Customer Portal for plan management
router.post('/portal', authenticateToken, async (req, res) => {
    try {
        const userRes = await query(
            'SELECT stripe_customer_id FROM users WHERE id = $1',
            [req.user.id]
        );
        const customerId = userRes.rows[0]?.stripe_customer_id;
        if (!customerId) {
            return res.status(400).json({ error: 'No billing account found. Subscribe first.' });
        }

        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/billing`,
        });

        res.json({ url: session.url });
    } catch (err) {
        console.error('[subscriptions/portal] Error:', err);
        res.status(500).json({ error: 'Failed to open billing portal' });
    }
});

// ── POST /api/subscriptions/webhook ──────────────────────────────────────
// Stripe webhook — raw body is captured via express.json verify option in index.js
router.post('/webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(
            req.rawBody || req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET || ''
        );
    } catch (err) {
        console.error('[webhook] Invalid signature:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const userId = session.metadata?.userId;
                const tier = session.metadata?.tier;
                if (userId && tier) {
                    const sub = await stripe.subscriptions.retrieve(session.subscription);
                    await query(
                        `UPDATE users SET subscription_tier = $1,
                             subscription_start = $2,
                             subscription_end = $3
                         WHERE id = $4`,
                        [
                            tier,
                            new Date(sub.current_period_start * 1000).toISOString(),
                            new Date(sub.current_period_end * 1000).toISOString(),
                            userId,
                        ]
                    );
                }
                break;
            }
            case 'customer.subscription.updated': {
                const sub = event.data.object;
                const customerId = sub.customer;
                const priceId = sub.items.data[0]?.price?.id;
                const tier = PRICE_TO_TIER[priceId] || 'free';
                await query(
                    `UPDATE users SET subscription_tier = $1,
                         subscription_start = $2,
                         subscription_end = $3
                     WHERE stripe_customer_id = $4`,
                    [
                        tier,
                        new Date(sub.current_period_start * 1000).toISOString(),
                        new Date(sub.current_period_end * 1000).toISOString(),
                        customerId,
                    ]
                );
                break;
            }
            case 'customer.subscription.deleted': {
                const sub = event.data.object;
                await query(
                    `UPDATE users SET subscription_tier = 'free',
                         subscription_end = $1
                     WHERE stripe_customer_id = $2`,
                    [new Date(sub.ended_at * 1000).toISOString(), sub.customer]
                );
                break;
            }
        }
        res.json({ received: true });
    } catch (err) {
        console.error('[webhook] Handler error:', err);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

export default router;
