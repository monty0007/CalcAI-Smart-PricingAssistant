import { useNavigate } from 'react-router-dom';
import { TrendingUp, X, Zap } from 'lucide-react';

/**
 * TierLimitModal
 * Shows when a user hits their subscription limit.
 *
 * Props:
 *   isOpen     – boolean
 *   onClose    – () => void
 *   resource   – 'ai_calls' | 'estimates'
 *   tier       – current tier string
 *   limit      – numeric limit
 */
export default function TierLimitModal({ isOpen, onClose, resource, tier, limit }) {
    const navigate = useNavigate();

    if (!isOpen) return null;

    const isAI = resource === 'ai_calls';
    const label = isAI ? 'AI messages' : 'saved estimates';
    const tierLabel = tier ? tier[0].toUpperCase() + tier.slice(1) : 'Free';

    function upgrade() {
        onClose();
        navigate('/pricing');
    }

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={onClose}>
            <div
                style={{
                    background: 'var(--bg-panel)', borderRadius: 16, padding: '32px 28px', maxWidth: 440, width: '100%',
                    position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                }}
                onClick={e => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                    <X size={18} />
                </button>

                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <Zap size={26} style={{ color: '#f59e0b' }} />
                    </div>
                    <h2 style={{ fontWeight: 700, fontSize: '1.35rem', margin: '0 0 8px' }}>Limit Reached</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
                        You've used all <strong>{limit} {label}</strong> on your <strong>{tierLabel}</strong> plan this month.
                        Upgrade to get more.
                    </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button
                        onClick={upgrade}
                        style={{
                            padding: '12px', background: 'var(--accent)', color: 'white', border: 'none',
                            borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '1rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}>
                        <TrendingUp size={16} /> View Plans
                    </button>
                    <button onClick={onClose}
                        style={{ padding: '10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        Maybe Later
                    </button>
                </div>
            </div>
        </div>
    );
}
