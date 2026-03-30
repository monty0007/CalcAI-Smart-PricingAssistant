import { useState } from 'react';
import { Send, MessageSquare, CheckCircle, HelpCircle, Zap, ShieldCheck, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { submitSupportTicket } from '../services/subscriptionApi';
import toast from 'react-hot-toast';

const FAQS = [
    {
        q: 'How do I save an estimate?',
        a: 'Build your estimate in the Calculator, then click the Save button in the panel on the right. Free accounts can save up to 3 estimates per month.',
    },
    {
        q: "What's included in the Plus plan?",
        a: '300 AI messages per month, 20 saved estimates, and Export to Excel — all for ₹199/month.',
    },
    {
        q: 'Can I get a custom Excel export format?',
        a: 'Yes! Pro plan users can request a fully customised Excel export format. Contact us via this form and we\'ll set it up for you.',
    },
    {
        q: 'How do I change my billing plan?',
        a: "Go to Billing in the top-right menu. You'll see your current plan and options to upgrade or manage your subscription.",
    },
];

function FaqItem({ q, a }) {
    const [open, setOpen] = useState(false);
    return (
        <div style={{
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            background: 'var(--bg-card)',
        }}>
            <button
                onClick={() => setOpen(p => !p)}
                style={{
                    width: '100%', padding: '14px 18px', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: 12, background: 'none', border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                }}
            >
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{q}</span>
                <span style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: open ? 'var(--accent)' : 'var(--bg-tertiary)',
                    color: open ? 'white' : 'var(--text-secondary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, fontSize: '1rem', lineHeight: 1,
                    transition: 'background 0.2s, color 0.2s',
                }}>
                    {open ? '−' : '+'}
                </span>
            </button>
            {open && (
                <div style={{
                    padding: '12px 18px 16px',
                    fontSize: '0.875rem', color: 'var(--text-secondary)',
                    lineHeight: 1.65, borderTop: '1px solid var(--border-primary)',
                }}>
                    {a}
                </div>
            )}
        </div>
    );
}

export default function SupportPage() {
    const { user } = useAuth();
    const [form, setForm] = useState({
        name: user?.name || '',
        email: user?.email || '',
        subject: '',
        message: '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(null);

    function handleChange(e) {
        setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    }

    async function handleSubmit(e) {
        e.preventDefault();
        const { name, email, subject, message } = form;
        if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
            toast.error('Please fill in all fields.');
            return;
        }
        try {
            setSubmitting(true);
            const data = await submitSupportTicket(form);
            setSubmitted({ ticketId: data.ticketId });
        } catch (err) {
            toast.error(err.message || 'Failed to submit ticket');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div style={{ height: 'calc(100vh - 48px)', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* ── Hero ── */}
            <div style={{
                background: 'linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%)',
                borderBottom: '1px solid var(--border-primary)',
                padding: '20px 24px 18px',
                textAlign: 'center',
                flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 6 }}>
                    <MessageSquare size={20} style={{ color: 'var(--accent)' }} />
                    <h1 style={{ fontWeight: 800, fontSize: '1.35rem', margin: 0, color: 'var(--text-primary)' }}>
                        Support Center
                    </h1>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0 auto', maxWidth: 480, lineHeight: 1.5 }}>
                    Have a question or issue? We typically respond within a few hours.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                    {[
                        { icon: Zap, label: 'Fast responses' },
                        { icon: ShieldCheck, label: 'Secure & private' },
                        { icon: Mail, label: 'Email confirmation' },
                    ].map(({ icon: Icon, label }) => (
                        <div key={label} style={{
                            display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-card)',
                            border: '1px solid var(--border-primary)', borderRadius: 99, padding: '4px 12px',
                            fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)',
                        }}>
                            <Icon size={11} style={{ color: 'var(--accent)' }} /> {label}
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Body ── */}
            <div style={{
                maxWidth: 1060, width: '100%', margin: '0 auto', padding: '20px 24px',
                display: 'grid', gridTemplateColumns: '1fr 360px', gap: 28, alignItems: 'start',
                flex: 1, overflow: 'hidden', boxSizing: 'border-box',
            }}>

                {/* Left: form */}
                <div>
                    <h2 style={{ fontWeight: 700, fontSize: '1rem', margin: '0 0 12px', color: 'var(--text-primary)' }}>
                        Submit a Ticket
                    </h2>

                    {submitted ? (
                        <div style={{
                            background: 'var(--bg-card)', border: '1px solid #10b981',
                            borderRadius: 'var(--radius-lg)', padding: '36px 32px', textAlign: 'center',
                        }}>
                            <div style={{
                                width: 56, height: 56, borderRadius: '50%', background: 'rgba(16,185,129,0.1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
                            }}>
                                <CheckCircle size={28} style={{ color: '#10b981' }} />
                            </div>
                            <h3 style={{ fontWeight: 700, fontSize: '1.15rem', margin: '0 0 8px', color: 'var(--text-primary)' }}>
                                Ticket Submitted!
                            </h3>
                            <p style={{ color: 'var(--text-secondary)', margin: '0 0 6px', fontSize: '0.9rem' }}>
                                Reference: <strong style={{ color: 'var(--text-primary)' }}>#{submitted.ticketId}</strong>
                            </p>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0 0 24px' }}>
                                We'll get back to you at <strong>{form.email}</strong> as soon as possible.
                            </p>
                            <button
                                onClick={() => { setSubmitted(null); setForm(f => ({ ...f, subject: '', message: '' })); }}
                                style={{
                                    padding: '9px 22px', background: 'var(--accent)', color: 'white', border: 'none',
                                    borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem',
                                    fontFamily: 'inherit',
                                }}
                            >
                                Submit Another
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} style={{
                            background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
                            borderRadius: 'var(--radius-lg)', padding: '18px',
                            boxShadow: 'var(--shadow-card)',
                        }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                                <div>
                                    <label style={labelStyle}>Full Name *</label>
                                    <input name="name" value={form.name} onChange={handleChange} required
                                        placeholder="Your name" style={inputStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle}>Email Address *</label>
                                    <input name="email" type="email" value={form.email} onChange={handleChange} required
                                        placeholder="you@example.com" style={inputStyle} />
                                </div>
                            </div>
                            <div style={{ marginBottom: 10 }}>
                                <label style={labelStyle}>Subject *</label>
                                <input name="subject" value={form.subject} onChange={handleChange} required
                                    placeholder="Brief summary of your issue" style={inputStyle} />
                            </div>
                            <div style={{ marginBottom: 14 }}>
                                <label style={labelStyle}>Message *</label>
                                <textarea name="message" value={form.message} onChange={handleChange} required
                                    rows={3} placeholder="Describe your issue in detail…"
                                    style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
                            </div>
                            <button
                                type="submit"
                                disabled={submitting}
                                style={{
                                    width: '100%', padding: '12px', background: 'var(--accent)', color: 'white',
                                    border: 'none', borderRadius: 'var(--radius-sm)', cursor: submitting ? 'not-allowed' : 'pointer',
                                    fontWeight: 700, fontSize: '0.95rem', opacity: submitting ? 0.75 : 1,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                    transition: 'opacity 0.2s', fontFamily: 'inherit',
                                }}
                            >
                                <Send size={15} />
                                {submitting ? 'Submitting…' : 'Submit Ticket'}
                            </button>
                        </form>
                    )}
                </div>

                {/* Right: FAQ */}
                <div>
                    <h2 style={{ fontWeight: 700, fontSize: '1rem', margin: '0 0 12px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <HelpCircle size={18} style={{ color: 'var(--accent)' }} />
                        Frequently Asked
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {FAQS.map(faq => <FaqItem key={faq.q} {...faq} />)}
                    </div>

                    {/* Tip */}
                    <div style={{
                        marginTop: 12, background: 'rgba(0,120,212,0.05)',
                        border: '1px solid rgba(0,120,212,0.15)',
                        borderRadius: 'var(--radius-md)', padding: '16px 18px',
                    }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--accent)', marginBottom: 6 }}>
                            💡 Pro Tip
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            Include your ticket reference number and a screenshot if possible — it helps us resolve issues much faster.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

const labelStyle = {
    display: 'block',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 5,
    letterSpacing: 0.2,
};

const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid var(--border-primary)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    fontSize: '0.875rem',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    outline: 'none',
};
