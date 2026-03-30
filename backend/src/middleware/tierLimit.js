/**
 * Tier Limits Middleware
 * Checks user subscription tier and blocks requests when limits are exceeded.
 */

import { query } from '../db.js';

export const TIER_LIMITS = {
    free: { ai_calls: 50, ai_calls_period: 'day', estimates: 3 },
    plus: { ai_calls: 300, ai_calls_period: 'month', estimates: 20 },
    pro:  { ai_calls: Infinity, ai_calls_period: 'month', estimates: Infinity },
};

/**
 * Returns the current month string e.g. "2026-03"
 */
function currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Returns the current date string e.g. "2026-03-10"
 */
function currentDay() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Get or create usage record for a user in the given period key (month or day).
 */
export async function getOrCreateUsage(userId, periodKey) {
    const key = periodKey || currentMonth();
    const existing = await query(
        'SELECT * FROM usage_tracking WHERE user_id = $1 AND month = $2',
        [userId, key]
    );
    if (existing.rows.length > 0) return existing.rows[0];

    const created = await query(
        `INSERT INTO usage_tracking (user_id, month, ai_calls, estimate_count)
         VALUES ($1, $2, 0, 0)
         ON CONFLICT (user_id, month) DO UPDATE SET user_id = EXCLUDED.user_id
         RETURNING *`,
        [userId, key]
    );
    return created.rows[0];
}

/**
 * Middleware factory: checkTierLimit('ai_calls' | 'estimates')
 * Must be used AFTER authenticateToken.
 */
export function checkTierLimit(resource) {
    return async (req, res, next) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            // Get current tier from DB
            const userRes = await query(
                'SELECT subscription_tier FROM users WHERE id = $1',
                [userId]
            );
            const tier = userRes.rows[0]?.subscription_tier || 'free';
            const tierCfg = TIER_LIMITS[tier] || TIER_LIMITS.free;
            const limit = resource === 'ai_calls' ? tierCfg.ai_calls : tierCfg.estimates;

            if (limit === Infinity) return next(); // Pro — unlimited

            // For free AI calls, enforce daily limit; all others are monthly
            const useDaily = resource === 'ai_calls' && tierCfg.ai_calls_period === 'day';
            const periodKey = useDaily ? currentDay() : currentMonth();

            const usage = await getOrCreateUsage(userId, periodKey);
            const current = usage[resource === 'ai_calls' ? 'ai_calls' : 'estimate_count'] || 0;

            if (current >= limit) {
                const periodLabel = useDaily ? 'today' : 'this month';
                return res.status(403).json({
                    error: 'limit_exceeded',
                    resource,
                    current,
                    limit,
                    tier,
                    message: `You've reached your ${tier} plan limit of ${limit} ${resource === 'ai_calls' ? 'AI messages' : 'saved estimates'} ${periodLabel}. ${tier === 'free' ? 'Upgrade to Plus for 300/month.' : 'Upgrade to continue.'}`,
                });
            }

            // Attach info to request so route handlers can increment
            req.tierInfo = { tier, limit, current, resource, periodKey };
            next();
        } catch (err) {
            console.error('[tierLimit] Error:', err);
            next(); // Fail open to avoid blocking users on infra issues
        }
    };
}

/**
 * Increment usage counter after a successful action.
 * Call this inside route handlers after the action succeeds.
 */
export async function incrementUsage(userId, resource, periodKey) {
    const key = periodKey || currentMonth();
    const col = resource === 'ai_calls' ? 'ai_calls' : 'estimate_count';
    await query(
        `INSERT INTO usage_tracking (user_id, month, ${col})
         VALUES ($1, $2, 1)
         ON CONFLICT (user_id, month) DO UPDATE
         SET ${col} = usage_tracking.${col} + 1`,
        [userId, key]
    );
}
