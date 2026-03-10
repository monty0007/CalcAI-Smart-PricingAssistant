import { useState, useEffect } from 'react';
import { Zap, Star, Shield, TrendingUp, MessageSquare, FileText, Calendar, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getMySubscription } from '../services/subscriptionApi';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

const TIER_INFO = {
    free: { label: 'Free', icon: Zap, color: '#6b7280', ai_limit: 50, ai_period: 'day', estimate_limit: 3 },
    plus: { label: 'Plus', icon: Star, color: '#7c3aed', ai_limit: 300, ai_period: 'month', estimate_limit: 20 },
    pro: { label: 'Pro', icon: Shield, color: '#059669', ai_limit: Infinity, ai_period: 'month', estimate_limit: Infinity },
};

function UsageBar({ current, limit, color }) {
    const pct = limit === Infinity ? 0 : Math.min(100, (current / limit) * 100);
    return (
        <div style={{ marginTop: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                <span>{current} used</span>
                <span>{limit === Infinity ? 'Unlimited' : `${limit} total`}</span>
            </div>
            {limit !== Infinity && (
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct > 80 ? '#ef4444' : color, borderRadius: 3, transition: 'width 0.4s' }} />
                </div>
            )}
        </div>
    );
}

export default function BillingPage() {
    const { user, token } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [sub, setSub] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        if (searchParams.get('success') === '1') {
            toast.success('Subscription activated! Welcome to your new plan 🎉');
        }
        getMySubscription(token)
            .then(data => setSub(data))
            .catch(err => { console.error(err); toast.error('Failed to load subscription info'); })
            .finally(() => setLoading(false));
    }, [user, token]);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300, color: 'var(--text-secondary)' }}>
                Loading billing info...
            </div>
        );
    }

    const tier = sub?.tier || 'free';
    const tierInfo = TIER_INFO[tier] || TIER_INFO.free;
    const TierIcon = tierInfo.icon;

    return (
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 20px' }}>
            {/* Page header */}
            <div style={{ marginBottom: 28 }}>
                <h1 style={{ fontWeight: 700, fontSize: '1.5rem', margin: '0 0 4px' }}>Billing &amp; Plan</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.87rem', margin: 0 }}>
                    View your current plan and usage.
                </p>
            </div>

            {/* Current plan card */}
            <div style={{
                background: 'var(--bg-panel)',
                border: `2px solid ${tierInfo.color}44`,
                borderRadius: 14,
                overflow: 'hidden',
                marginBottom: 16,
            }}>
                {/* Plan header stripe */}
                <div style={{
                    background: tierInfo.color + '18',
                    borderBottom: `1px solid ${tierInfo.color}30`,
                    padding: '16px 22px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                }}>
                    <div style={{
                        width: 38, height: 38, borderRadius: 10,
                        background: tierInfo.color + '22',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        <TierIcon size={20} style={{ color: tierInfo.color }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '1rem' }}>{tierInfo.label} Plan</div>
                        {sub?.subscriptionEnd ? (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                <Calendar size={11} /> Expires {new Date(sub.subscriptionEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                        ) : tier === 'free' ? (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>No expiry</div>
                        ) : null}
                    </div>
                    <span style={{
                        background: tierInfo.color, color: 'white',
                        padding: '3px 12px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700,
                        letterSpacing: '0.5px',
                    }}>
                        {tier.toUpperCase()}
                    </span>
                    {tier !== 'free' && (
                        <CheckCircle2 size={18} style={{ color: tierInfo.color, flexShrink: 0 }} />
                    )}
                </div>

                {/* Usage section */}
                <div style={{ padding: '20px 22px' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 14 }}>Usage</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border-primary)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                                <MessageSquare size={14} style={{ color: tierInfo.color }} />
                                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>AI Messages</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                                {tierInfo.ai_limit === Infinity ? 'Unlimited' : `${tierInfo.ai_limit} / ${tierInfo.ai_period}`}
                            </div>
                            <UsageBar current={sub?.usage?.ai_calls || 0} limit={tierInfo.ai_limit} color={tierInfo.color} />
                        </div>
                        <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border-primary)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                                <FileText size={14} style={{ color: tierInfo.color }} />
                                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Saved Estimates</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                                {tierInfo.estimate_limit === Infinity ? 'Unlimited' : `Up to ${tierInfo.estimate_limit}`}
                            </div>
                            <UsageBar current={sub?.usage?.estimate_count || 0} limit={tierInfo.estimate_limit} color={tierInfo.color} />
                        </div>
                    </div>
                </div>

                {/* Actions */}
                {tier !== 'pro' && (
                    <div style={{ padding: '0 22px 20px' }}>
                        <button
                            onClick={() => navigate('/pricing')}
                            style={{
                                padding: '9px 20px', borderRadius: 8, background: tierInfo.color,
                                border: 'none', cursor: 'pointer', fontWeight: 600,
                                color: 'white', fontSize: '0.875rem',
                                display: 'inline-flex', alignItems: 'center', gap: 7,
                            }}
                        >
                            <TrendingUp size={14} />
                            {tier === 'free' ? 'Upgrade Plan' : 'View Plans'}
                        </button>
                    </div>
                )}
            </div>

            <p style={{ fontSize: '0.77rem', color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.6 }}>
                Free plan: 50 AI messages/day · Plus plan: 300 AI messages/month · Pro: unlimited ·
                Paid plans grant 30 days access · Payments secured by Razorpay
            </p>
        </div>
    );
}
