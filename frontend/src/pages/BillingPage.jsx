import { useState, useEffect } from 'react';
import { CreditCard, Zap, Star, Shield, TrendingUp, MessageSquare, FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getMySubscription, createPortalSession } from '../services/subscriptionApi';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

const TIER_INFO = {
    free: { label: 'Free', icon: Zap, color: '#6b7280', ai_limit: 20, estimate_limit: 3 },
    plus: { label: 'Plus', icon: Star, color: '#7c3aed', ai_limit: 200, estimate_limit: 20 },
    pro: { label: 'Pro', icon: Shield, color: '#059669', ai_limit: Infinity, estimate_limit: Infinity },
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
    const [portalLoading, setPortalLoading] = useState(false);

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

    async function openPortal() {
        try {
            setPortalLoading(true);
            const { url } = await createPortalSession(token);
            window.location.href = url;
        } catch (err) {
            toast.error(err.message || 'Failed to open billing portal');
        } finally {
            setPortalLoading(false);
        }
    }

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
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px' }}>
            <h1 style={{ fontWeight: 700, fontSize: '1.7rem', marginBottom: 8 }}>Billing & Plan</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>
                Manage your subscription and view usage.
            </p>

            {/* Current plan card */}
            <div style={{ background: 'var(--bg-panel)', border: `1px solid var(--border)`, borderRadius: 14, padding: 28, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                    <TierIcon size={22} style={{ color: tierInfo.color }} />
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{tierInfo.label} Plan</div>
                        {sub?.subscriptionEnd && (
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                Renews {new Date(sub.subscriptionEnd).toLocaleDateString()}
                            </div>
                        )}
                    </div>
                    <span style={{
                        marginLeft: 'auto', background: tierInfo.color + '22', color: tierInfo.color,
                        padding: '3px 12px', borderRadius: 99, fontSize: '0.8rem', fontWeight: 600,
                    }}>
                        {tier.toUpperCase()}
                    </span>
                </div>

                {/* Usage section */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                    <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <MessageSquare size={15} style={{ color: tierInfo.color }} />
                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>AI Messages</span>
                        </div>
                        <UsageBar current={sub?.usage?.ai_calls || 0} limit={tierInfo.ai_limit} color={tierInfo.color} />
                    </div>
                    <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <FileText size={15} style={{ color: tierInfo.color }} />
                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Saved Estimates</span>
                        </div>
                        <UsageBar current={sub?.usage?.estimate_count || 0} limit={tierInfo.estimate_limit} color={tierInfo.color} />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {tier !== 'free' && (
                        <button
                            onClick={openPortal}
                            disabled={portalLoading}
                            style={{
                                padding: '10px 20px', borderRadius: 8, background: 'var(--bg-surface)',
                                border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 600,
                                color: 'var(--text)', fontSize: '0.9rem',
                                opacity: portalLoading ? 0.7 : 1,
                            }}
                        >
                            <CreditCard size={15} style={{ marginRight: 6, verticalAlign: -2 }} />
                            {portalLoading ? 'Loading...' : 'Manage Plan'}
                        </button>
                    )}
                    {tier !== 'pro' && (
                        <button
                            onClick={() => navigate('/pricing')}
                            style={{
                                padding: '10px 20px', borderRadius: 8, background: tierInfo.color,
                                border: 'none', cursor: 'pointer', fontWeight: 600,
                                color: 'white', fontSize: '0.9rem',
                            }}
                        >
                            <TrendingUp size={15} style={{ marginRight: 6, verticalAlign: -2 }} />
                            Upgrade Plan
                        </button>
                    )}
                </div>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 16 }}>
                Usage resets on the 1st of each month. Payments are handled by Stripe.
            </p>
        </div>
    );
}
