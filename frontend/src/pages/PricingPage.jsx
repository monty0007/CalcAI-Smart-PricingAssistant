import { useState } from 'react';
import { Check, Zap, Star, Shield, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { createRazorpayOrder, verifyRazorpayPayment } from '../services/subscriptionApi';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const PLANS = [
    {
        id: 'free',
        name: 'Free',
        price: '₹0',
        period: '/month',
        description: 'Get started with Azure pricing estimates.',
        icon: Zap,
        color: 'var(--accent)',
        features: [
            '50 AI messages per day',
            '3 saved estimates',
            'VM comparison',
            'All Azure regions',
        ],
        unavailable: [
            'Export to Excel',
            'Priority support',
        ],
        cta: 'Get Started',
        highlight: false,
    },
    {
        id: 'plus',
        name: 'Plus',
        price: '₹199',
        period: '/month',
        description: 'For professionals who need more power.',
        icon: Star,
        color: '#7c3aed',
        features: [
            '300 AI messages per month',
            '20 saved estimates',
            'Export to Excel',
            'VM comparison',
            'All Azure regions',
        ],
        unavailable: [
            'Priority support',
        ],
        cta: 'Upgrade to Plus',
        highlight: true,
    },
    {
        id: 'pro',
        name: 'Pro',
        price: '₹499',
        period: '/month',
        description: 'Unlimited power for teams and businesses.',
        icon: Shield,
        color: '#059669',
        features: [
            'Unlimited AI messages',
            'Unlimited saved estimates',
            'Export to Excel',
            'Custom Excel format on request',
            'VM comparison',
            'All Azure regions',
            'Priority support',
        ],
        unavailable: [],
        cta: 'Upgrade to Pro',
        highlight: false,
    },
];

export default function PricingPage() {
    const { user, token, refreshUser } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(null);
    const currentTier = user?.subscription_tier || 'free';

    // Dynamically load Razorpay checkout.js once
    function loadRazorpayScript() {
        return new Promise((resolve) => {
            if (window.Razorpay) return resolve(true);
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.body.appendChild(script);
        });
    }

    async function handleSubscribe(plan) {
        if (!user) {
            navigate('/login');
            return;
        }
        if (plan.id === 'free') {
            navigate('/dashboard');
            return;
        }
        try {
            setLoading(plan.id);

            const loaded = await loadRazorpayScript();
            if (!loaded) {
                toast.error('Could not load payment gateway. Check your internet connection.');
                return;
            }

            const order = await createRazorpayOrder(token, plan.id);

            await new Promise((resolve, reject) => {
                const rzp = new window.Razorpay({
                    key: order.keyId,
                    amount: order.amount,
                    currency: order.currency,
                    name: 'Azure Pricing Calc',
                    description: `${plan.name} Plan — 1 Month`,
                    order_id: order.orderId,
                    prefill: order.prefill,
                    theme: { color: plan.color },
                    modal: {
                        ondismiss: () => reject(new Error('Payment cancelled')),
                    },
                    handler: async (response) => {
                        try {
                            await verifyRazorpayPayment(token, {
                                razorpay_order_id:   response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature:  response.razorpay_signature,
                                tier: plan.id,
                            });
                            toast.success(`🎉 You're now on the ${plan.name} plan!`);
                            if (typeof refreshUser === 'function') await refreshUser();
                            navigate('/billing');
                            resolve();
                        } catch (err) {
                            reject(err);
                        }
                    },
                });
                rzp.open();
            });
        } catch (err) {
            if (err.message !== 'Payment cancelled') {
                toast.error(err.message || 'Payment failed. Please try again.');
            }
        } finally {
            setLoading(null);
        }
    }

    return (
        <div style={{
            height: 'calc(100vh - 48px)',
            display: 'flex',
            flexDirection: 'column',
            padding: '24px 24px 16px',
            maxWidth: 1060,
            margin: '0 auto',
            boxSizing: 'border-box',
            overflowY: 'auto',
        }}>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 20, flexShrink: 0 }}>
                <h1 style={{ fontSize: '1.55rem', fontWeight: 700, margin: '0 0 6px' }}>
                    Simple, Transparent Pricing
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                    Choose the plan that fits your workflow. Upgrade or downgrade at any time.
                </p>
                {user && currentTier !== 'pro' && (
                    <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', borderRadius: 99, padding: '4px 14px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        <CheckCircle2 size={13} style={{ color: 'var(--accent)' }} />
                        You are on the <strong style={{ color: 'var(--text-primary)', marginLeft: 3, textTransform: 'capitalize' }}>{currentTier}</strong>&nbsp;plan
                    </div>
                )}
            </div>

            {/* Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 16,
                flex: 1,
                minHeight: 0,
            }}>
                {PLANS.map(plan => {
                    const PlanIcon = plan.icon;
                    return (
                        <div
                            key={plan.id}
                            style={{
                                background: 'var(--bg-panel)',
                                border: plan.id === currentTier
                                    ? `2px solid ${plan.color}`
                                    : plan.highlight
                                        ? `2px solid ${plan.color}`
                                        : '1px solid var(--border)',
                                borderRadius: 14,
                                padding: '20px 20px 18px',
                                position: 'relative',
                                boxShadow: (plan.id === currentTier || plan.highlight) ? `0 4px 20px ${plan.color}22` : 'none',
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden',
                            }}
                        >
                            {plan.id === currentTier ? (
                                <div style={{
                                    position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)',
                                    background: plan.color, color: 'white', fontSize: 10, fontWeight: 700,
                                    padding: '3px 14px', borderRadius: '0 0 8px 8px', letterSpacing: 0.8,
                                    whiteSpace: 'nowrap',
                                }}>
                                    ✓ CURRENT PLAN
                                </div>
                            ) : plan.highlight ? (
                                <div style={{
                                    position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)',
                                    background: plan.color, color: 'white', fontSize: 10, fontWeight: 700,
                                    padding: '3px 14px', borderRadius: '0 0 8px 8px', letterSpacing: 0.8,
                                    whiteSpace: 'nowrap',
                                }}>
                                    MOST POPULAR
                                </div>
                            ) : null}

                            {/* Plan name */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: (plan.highlight || plan.id === currentTier) ? 12 : 0 }}>
                                <PlanIcon size={18} style={{ color: plan.color }} />
                                <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{plan.name}</h2>
                            </div>

                            {/* Price */}
                            <div style={{ marginBottom: 6 }}>
                                <span style={{ fontSize: '2rem', fontWeight: 800, color: plan.color, lineHeight: 1 }}>{plan.price}</span>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginLeft: 2 }}>{plan.period}</span>
                            </div>

                            {/* Description */}
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0 0 14px', lineHeight: 1.45 }}>
                                {plan.description}
                            </p>

                            {/* Features */}
                            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', flex: 1 }}>
                                {plan.features.map(f => (
                                    <li key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 7, fontSize: '0.82rem' }}>
                                        <Check size={13} style={{ color: plan.color, flexShrink: 0, marginTop: 2 }} />
                                        <span>{f}</span>
                                    </li>
                                ))}
                                {plan.unavailable.map(f => (
                                    <li key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 7, fontSize: '0.82rem', opacity: 0.38 }}>
                                        <span style={{ width: 13, display: 'inline-block', flexShrink: 0, textAlign: 'center' }}>—</span>
                                        <span style={{ textDecoration: 'line-through' }}>{f}</span>
                                    </li>
                                ))}
                            </ul>

                            {/* CTA */}
                            {plan.id === currentTier ? (
                                <button
                                    disabled
                                    style={{
                                        width: '100%',
                                        padding: '9px',
                                        border: `1px solid ${plan.color}55`,
                                        borderRadius: 9,
                                        background: plan.color + '18',
                                        color: plan.color,
                                        fontWeight: 600,
                                        fontSize: '0.875rem',
                                        cursor: 'default',
                                        flexShrink: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 6,
                                    }}
                                >
                                    <CheckCircle2 size={14} /> Current Plan
                                </button>
                            ) : currentTier === 'pro' ? (
                                <button
                                    disabled
                                    style={{
                                        width: '100%',
                                        padding: '9px',
                                        border: '1px solid var(--border)',
                                        borderRadius: 9,
                                        background: 'var(--bg-surface)',
                                        color: 'var(--text-muted)',
                                        fontWeight: 600,
                                        fontSize: '0.875rem',
                                        cursor: 'not-allowed',
                                        flexShrink: 0,
                                        opacity: 0.45,
                                    }}
                                >
                                    {plan.cta}
                                </button>
                            ) : (
                                <button
                                    onClick={() => handleSubscribe(plan)}
                                    disabled={loading === plan.id}
                                    style={{
                                        width: '100%',
                                        padding: '9px',
                                        border: plan.highlight ? 'none' : '1px solid var(--border)',
                                        borderRadius: 9,
                                        background: plan.highlight ? plan.color : 'var(--bg-surface)',
                                        color: plan.highlight ? 'white' : 'var(--text)',
                                        fontWeight: 600,
                                        fontSize: '0.875rem',
                                        cursor: 'pointer',
                                        opacity: loading === plan.id ? 0.7 : 1,
                                        transition: 'opacity 0.2s, filter 0.2s',
                                        flexShrink: 0,
                                    }}
                                    onMouseEnter={e => { if (!plan.highlight) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                                    onMouseLeave={e => { if (!plan.highlight) e.currentTarget.style.background = 'var(--bg-surface)'; }}
                                >
                                    {loading === plan.id ? 'Processing…' : plan.cta}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Footer note */}
            <p style={{ textAlign: 'center', marginTop: 12, color: 'var(--text-secondary)', fontSize: '0.78rem', flexShrink: 0 }}>
            Prices in Indian Rupees (INR) · 30-day access on paid plans · No credit card required for Free · Payments secured by Razorpay
            </p>
        </div>
    );
}
