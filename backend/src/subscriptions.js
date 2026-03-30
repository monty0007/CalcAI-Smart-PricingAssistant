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
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { query } from './db.js';
import { authenticateToken } from './auth.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || '',
    key_secret: process.env.RAZORPAY_KEY_SECRET || '',
});

// Amounts in paise (INR × 100)
const RAZORPAY_PLAN_AMOUNTS = {
    plus: 24900,  // ₹249
    pro:  49900,  // ₹499
};

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

// ── POST /api/subscriptions/razorpay/create-order ───────────────────────────
// Creates a Razorpay order and returns order details to the frontend
router.post('/razorpay/create-order', authenticateToken, async (req, res) => {
    try {
        const { tier } = req.body;
        if (!RAZORPAY_PLAN_AMOUNTS[tier]) {
            return res.status(400).json({ error: 'Invalid tier. Must be "plus" or "pro".' });
        }

        const userRes = await query('SELECT email, name FROM users WHERE id = $1', [req.user.id]);
        const user = userRes.rows[0];
        if (!user) return res.status(404).json({ error: 'User not found' });

        const order = await razorpay.orders.create({
            amount: RAZORPAY_PLAN_AMOUNTS[tier],
            currency: 'INR',
            receipt: `sub_${req.user.id}_${Date.now()}`,
            notes: {
                userId: String(req.user.id),
                tier,
                email: user.email,
            },
        });

        res.json({
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: process.env.RAZORPAY_KEY_ID,
            prefill: { name: user.name || '', email: user.email || '' },
        });
    } catch (err) {
        console.error('[razorpay/create-order] Error:', err);
        res.status(500).json({ error: 'Failed to create Razorpay order', message: err.message });
    }
});

// ── POST /api/subscriptions/razorpay/verify ──────────────────────────────────
// Verifies the HMAC signature from Razorpay and activates the subscription
router.post('/razorpay/verify', authenticateToken, async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, tier } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !tier) {
            return res.status(400).json({ error: 'Missing required payment fields' });
        }

        // Verify HMAC-SHA256 signature
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            console.warn('[razorpay/verify] Signature mismatch for user', req.user.id);
            return res.status(400).json({ error: 'Payment verification failed — invalid signature' });
        }

        // Activate subscription for 30 days
        const now = new Date();
        const end = new Date(now);
        end.setDate(end.getDate() + 30);

        await query(
            `UPDATE users
             SET subscription_tier = $1,
                 subscription_start = $2,
                 subscription_end   = $3,
                 razorpay_payment_id = $4
             WHERE id = $5`,
            [tier, now.toISOString(), end.toISOString(), razorpay_payment_id, req.user.id]
        );

        console.log(`[razorpay] ✅ User ${req.user.id} upgraded to ${tier} via payment ${razorpay_payment_id}`);
        res.json({ success: true, tier, expiresAt: end.toISOString() });
    } catch (err) {
        console.error('[razorpay/verify] Error:', err);
        res.status(500).json({ error: 'Failed to verify payment', message: err.message });
    }
});

export default router;
