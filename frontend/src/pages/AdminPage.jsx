import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Users, BarChart2, Ticket, Trash2, Search, X,
    CheckCircle, Clock, AlertCircle, Lock, Eye, EyeOff,
    TrendingUp, UserCheck, Crown, Zap, RefreshCw,
    Activity, MessageSquare, FileText, DollarSign,
    Database, Play, Server, Terminal,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
    adminGetStats, adminGetUsers, adminUpdateUserTier,
    adminDeleteUser, adminGetTickets, adminUpdateTicket,
    adminRunSync, adminGetSyncJobs, adminGetSyncJob, adminGetSyncStats,
} from '../services/subscriptionApi';
import toast from 'react-hot-toast';

const ADMIN_PASSWORD = 'meow';

const TABS = [
    { id: 'dashboard', label: 'Overview',   icon: BarChart2 },
    { id: 'users',     label: 'Customers',  icon: Users },
    { id: 'support',   label: 'Support',    icon: Ticket },
    { id: 'sync',      label: 'Data Sync',  icon: Database },
];

const STATUS_BADGE = {
    open:        { label: 'Open',        color: '#ef4444', bg: '#fef2f2', icon: AlertCircle },
    in_progress: { label: 'In Progress', color: '#f59e0b', bg: '#fffbeb', icon: Clock },
    resolved:    { label: 'Resolved',    color: '#10b981', bg: '#ecfdf5', icon: CheckCircle },
};

const TIER_META = {
    free: { label: 'Free', icon: Zap,        color: '#6b7280' },
    plus: { label: 'Plus', icon: TrendingUp, color: '#7c3aed' },
    pro:  { label: 'Pro',  icon: Crown,      color: '#059669' },
};

//  Helpers 
function Spinner() {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 10, color: 'var(--text-secondary)' }}>
            <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
            Loading...
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

function ErrorState({ message, onRetry }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 14 }}>
            <AlertCircle size={32} style={{ color: '#ef4444' }} />
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{message}</div>
            {onRetry && (
                <button onClick={onRetry} style={{ padding: '7px 18px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <RefreshCw size={13} /> Retry
                </button>
            )}
        </div>
    );
}

//  Password Gate 
function PasswordGate({ onUnlock }) {
    const [pw, setPw] = useState('');
    const [show, setShow] = useState(false);
    const [shake, setShake] = useState(false);
    const [error, setError] = useState(false);

    function attempt(e) {
        e.preventDefault();
        if (pw === ADMIN_PASSWORD) {
            sessionStorage.setItem('admin_unlocked', '1');
            onUnlock();
        } else {
            setShake(true);
            setError(true);
            setPw('');
            setTimeout(() => { setShake(false); setError(false); }, 600);
        }
    }

    return (
        <div style={{ height: 'calc(100vh - 48px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <form onSubmit={attempt} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
                borderRadius: 16, padding: '40px 36px', width: 340, textAlign: 'center',
                animation: shake ? 'adminShake 0.5s ease' : 'none',
            }}>
                <div style={{
                    width: 52, height: 52, borderRadius: '50%', background: 'var(--accent)15',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
                }}>
                    <Lock size={22} style={{ color: 'var(--accent)' }} />
                </div>
                <h2 style={{ fontWeight: 700, fontSize: '1.2rem', margin: '0 0 6px' }}>Admin Panel</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 24px' }}>
                    Enter the admin password to continue.
                </p>
                <div style={{ position: 'relative', marginBottom: error ? 8 : 16 }}>
                    <input
                        type={show ? 'text' : 'password'}
                        value={pw}
                        onChange={e => setPw(e.target.value)}
                        placeholder="Password"
                        autoFocus
                        style={{
                            width: '100%', padding: '10px 40px 10px 14px', boxSizing: 'border-box',
                            border: `1px solid ${error ? '#ef4444' : 'var(--border-primary)'}`, borderRadius: 9,
                            background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '1rem',
                        }}
                    />
                    <button type="button" onClick={() => setShow(s => !s)} style={{
                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4,
                    }}>
                        {show ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                </div>
                {error && <div style={{ color: '#ef4444', fontSize: '0.78rem', marginBottom: 10 }}>Incorrect password.</div>}
                <button type="submit" style={{
                    width: '100%', padding: '10px', background: 'var(--accent)',
                    color: 'white', border: 'none', borderRadius: 9,
                    fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                }}>
                    Unlock
                </button>
            </form>
            <style>{`
                @keyframes adminShake {
                    0%,100% { transform: translateX(0); }
                    20%     { transform: translateX(-8px); }
                    40%     { transform: translateX(8px); }
                    60%     { transform: translateX(-6px); }
                    80%     { transform: translateX(6px); }
                }
            `}</style>
        </div>
    );
}

//  Stat Card 
function StatCard({ label, value, sub, color = '#6b7280', icon: Icon, accent, children }) {
    return (
        <div style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px 22px',
            border: '1px solid var(--border-primary)',
            borderLeft: accent ? `4px solid ${color}` : '1px solid var(--border-primary)',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    {label}
                </span>
                {Icon && (
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={15} style={{ color }} />
                    </div>
                )}
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{value ?? '—'}</div>
            {sub && <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: 2 }}>{sub}</div>}
            {children}
        </div>
    );
}

function MiniBar({ value, max, color }) {
    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    return (
        <div style={{ marginTop: 10 }}>
            <div style={{ height: 5, borderRadius: 99, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.6s ease' }} />
            </div>
        </div>
    );
}

//  Dashboard Tab 
function DashboardTab({ token }) {
    const [stats, setStats] = useState(null);
    const [error, setError] = useState(null);

    const load = useCallback(() => {
        setError(null);
        setStats(null);
        adminGetStats(token)
            .then(setStats)
            .catch(err => {
                console.error('[DashboardTab]', err);
                setError('Failed to load stats. Check that the backend is running.');
            });
    }, [token]);

    useEffect(() => { load(); }, [load]);

    if (error) return <ErrorState message={error} onRetry={load} />;
    if (!stats) return <Spinner />;

    const free  = stats.tierBreakdown.free  || 0;
    const plus  = stats.tierBreakdown.plus  || 0;
    const pro   = stats.tierBreakdown.pro   || 0;
    const total = stats.totalUsers          || 0;
    const paying = plus + pro;
    const payingPct = total > 0 ? Math.round((paying / total) * 100) : 0;
    const freePct   = total > 0 ? Math.round((free   / total) * 100) : 0;
    const plusPct   = total > 0 ? Math.round((plus   / total) * 100) : 0;
    const proPct    = total > 0 ? Math.round((pro    / total) * 100) : 0;

    const aiCalls   = stats.thisMonth?.aiCalls   || 0;
    const estimates = stats.thisMonth?.estimates || 0;
    const openTickets  = stats.tickets?.open     || 0;
    const totalTickets = stats.tickets?.total    || 0;
    const resolvedTickets = stats.tickets?.resolved || 0;

    // Rough MRR: plus=₹199, pro=₹499
    const mrr = plus * 199 + pro * 499;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ── Hero KPI strip ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
                <StatCard label="Total Users" value={total} icon={Users} color="#0078d4" accent>
                    <MiniBar value={total} max={Math.max(total, 100)} color="#0078d4" />
                </StatCard>

                <StatCard label="Paying Customers" value={paying} icon={UserCheck} color="#059669" accent
                    sub={`${payingPct}% of all users`}>
                    <MiniBar value={paying} max={total} color="#059669" />
                </StatCard>

                <StatCard label="Est. Monthly Revenue" value={`₹${mrr.toLocaleString()}`} icon={DollarSign} color="#7c3aed" accent
                    sub="Based on Plus & Pro seats" />

                <StatCard label="Open Tickets" value={openTickets} icon={Ticket}
                    color={openTickets > 0 ? '#ef4444' : '#10b981'}
                    sub={totalTickets > 0 ? `${resolvedTickets} resolved of ${totalTickets}` : 'No tickets yet'} />
            </div>

            {/* ── Middle row: tier breakdown + activity ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

                {/* Tier breakdown card */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', padding: '20px 22px', boxShadow: 'var(--shadow-card)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Subscription Tiers</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{total} total</span>
                    </div>

                    {/* Segmented bar */}
                    {total > 0 && (
                        <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', marginBottom: 18, gap: 2 }}>
                            {[
                                { count: pro,   color: '#059669' },
                                { count: plus,  color: '#7c3aed' },
                                { count: free,  color: '#cbd5e1' },
                            ].filter(s => s.count > 0).map((s, i) => (
                                <div key={i} style={{ flex: s.count, background: s.color, minWidth: 4 }} />
                            ))}
                        </div>
                    )}

                    {/* Tier rows */}
                    {[
                        { label: 'Pro',  count: pro,  pct: proPct,  color: '#059669', icon: Crown,      desc: '₹499/mo' },
                        { label: 'Plus', count: plus, pct: plusPct, color: '#7c3aed', icon: TrendingUp, desc: '₹199/mo' },
                        { label: 'Free', count: free, pct: freePct, color: '#94a3b8', icon: Zap,        desc: '₹0/mo'   },
                    ].map(tier => {
                        const TIcon = tier.icon;
                        return (
                            <div key={tier.label} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                <div style={{ width: 32, height: 32, borderRadius: 8, background: `${tier.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <TIcon size={15} style={{ color: tier.color }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{tier.label}</span>
                                        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{tier.count} <span style={{ fontWeight: 400, opacity: 0.65 }}>({tier.pct}%)</span></span>
                                    </div>
                                    <div style={{ height: 5, borderRadius: 99, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${tier.pct}%`, background: tier.color, borderRadius: 99, transition: 'width 0.6s ease' }} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Activity card */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', padding: '20px 22px', boxShadow: 'var(--shadow-card)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>This Month's Activity</span>
                        <Activity size={15} style={{ color: 'var(--text-secondary)' }} />
                    </div>

                    {[
                        { label: 'AI Messages Sent',  value: aiCalls,   icon: MessageSquare, color: '#0078d4', max: Math.max(aiCalls, 200) },
                        { label: 'Estimates Created', value: estimates,  icon: FileText,      color: '#7c3aed', max: Math.max(estimates, 50) },
                    ].map(row => {
                        const RIcon = row.icon;
                        return (
                            <div key={row.label} style={{ marginBottom: 20 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ width: 28, height: 28, borderRadius: 7, background: `${row.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <RIcon size={13} style={{ color: row.color }} />
                                        </div>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>{row.label}</span>
                                    </div>
                                    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: row.color }}>{row.value.toLocaleString()}</span>
                                </div>
                                <div style={{ height: 6, borderRadius: 99, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${Math.min(100, (row.value / row.max) * 100)}%`, background: row.color, borderRadius: 99, transition: 'width 0.6s ease' }} />
                                </div>
                            </div>
                        );
                    })}

                    {/* Divider */}
                    <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 14, marginTop: 4 }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>Support Tickets</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                            {[
                                { label: 'Open',       value: stats.tickets?.open || 0,       color: '#ef4444' },
                                { label: 'In Progress',value: stats.tickets?.inProgress || 0, color: '#f59e0b' },
                                { label: 'Resolved',   value: resolvedTickets,                 color: '#10b981' },
                            ].map(t => (
                                <div key={t.label} style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: t.color }}>{t.value}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2, fontWeight: 500 }}>{t.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

//  Customers Tab 
function UsersTab({ token }) {
    const [users, setUsers]       = useState([]);
    const [total, setTotal]       = useState(0);
    const [search, setSearch]     = useState('');
    const [tierFilter, setTierFilter] = useState('');
    const [page, setPage]         = useState(1);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        setError(null);
        adminGetUsers(token, { search, tier: tierFilter, page, limit: 25 })
            .then(data => { setUsers(data.users); setTotal(data.total); })
            .catch(err => { console.error('[UsersTab]', err); setError('Failed to load customers.'); })
            .finally(() => setLoading(false));
    }, [token, search, tierFilter, page]);

    useEffect(() => { load(); }, [load]);

    async function changeTier(userId, tier) {
        try {
            await adminUpdateUserTier(token, userId, tier);
            toast.success(`Plan changed to ${tier}`);
            load();
        } catch { toast.error('Failed to update plan'); }
    }

    async function deleteUser(userId, email) {
        if (!confirm(`Delete ${email}? This cannot be undone.`)) return;
        try {
            await adminDeleteUser(token, userId);
            toast.success('User deleted');
            load();
        } catch { toast.error('Failed to delete user'); }
    }

    return (
        <div>
            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                <h2 style={{ fontWeight: 700, margin: 0, fontSize: '1.05rem' }}>
                    All Customers <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>({total})</span>
                </h2>
                <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                        <input
                            placeholder="Search name or email..."
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1); }}
                            style={{ paddingLeft: 32, padding: '7px 12px 7px 32px', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.85rem', width: 220 }}
                        />
                    </div>
                    <select value={tierFilter} onChange={e => { setTierFilter(e.target.value); setPage(1); }}
                        style={{ padding: '7px 12px', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                        <option value="">All plans</option>
                        <option value="free">Free</option>
                        <option value="plus">Plus</option>
                        <option value="pro">Pro</option>
                    </select>
                </div>
            </div>

            {error ? (
                <ErrorState message={error} onRetry={load} />
            ) : (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-primary)' }}>
                                {['Customer', 'Plan', 'AI Calls', 'Estimates', 'Joined', ''].map((h, i) => (
                                    <th key={i} style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} style={{ padding: 28, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</td></tr>
                            ) : users.length === 0 ? (
                                <tr><td colSpan={6} style={{ padding: 28, textAlign: 'center', color: 'var(--text-secondary)' }}>No customers found.</td></tr>
                            ) : users.map((u, i) => {
                                const tier = u.subscription_tier || 'free';
                                return (
                                    <tr key={u.id}
                                    style={{ borderBottom: i < users.length - 1 ? '1px solid var(--border-primary)' : 'none', transition: 'background var(--transition-fast)' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <td style={{ padding: '12px 16px' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.name || '—'}</div>
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: 1 }}>{u.email}</div>
                                        </td>
                                        <td style={{ padding: '11px 14px' }}>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                {['free', 'plus', 'pro'].map(t => {
                                                    const m = TIER_META[t];
                                                    const active = tier === t;
                                                    return (
                                                        <button key={t}
                                                            onClick={() => !active && changeTier(u.id, t)}
                                                            title={active ? `Current plan` : `Switch to ${t}`}
                                                            style={{
                                                                padding: '3px 9px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700,
                                                                border: `1px solid ${active ? m.color : 'var(--border-primary)'}`,
                                                boxShadow: active ? `0 0 0 2px ${m.color}22` : 'none',
                                                                background: active ? m.color + '20' : 'transparent',
                                                                color: active ? m.color : 'var(--text-secondary)',
                                                                cursor: active ? 'default' : 'pointer',
                                                                transition: 'all 0.15s',
                                                            }}>
                                                            {t}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{u.ai_calls_this_month || 0}</td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{u.estimates_this_month || 0}</td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                            {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <button onClick={() => deleteUser(u.id, u.email)}
                                                title="Delete user"
                                                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4, borderRadius: 5, transition: 'color 0.15s' }}
                                                onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                                                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}>
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', marginTop: 14 }}>
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                    style={{ padding: '6px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', cursor: page === 1 ? 'not-allowed' : 'pointer', color: 'var(--text-primary)', opacity: page === 1 ? 0.4 : 1, fontSize: '0.85rem', fontWeight: 500 }}>
                    ← Prev
                </button>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Page {page}</span>
                <button disabled={users.length < 25} onClick={() => setPage(p => p + 1)}
                    style={{ padding: '6px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', cursor: users.length < 25 ? 'not-allowed' : 'pointer', color: 'var(--text-primary)', opacity: users.length < 25 ? 0.4 : 1, fontSize: '0.85rem', fontWeight: 500 }}>
                    Next →
                </button>
            </div>
        </div>
    );
}

//  Support Tab 
function SupportTicketsTab({ token }) {
    const [tickets, setTickets]     = useState([]);
    const [error, setError]         = useState(null);
    const [filter, setFilter]       = useState('');
    const [selected, setSelected]   = useState(null);
    const [replyText, setReplyText] = useState('');
    const [sending, setSending]     = useState(false);

    const load = useCallback(() => {
        setError(null);
        adminGetTickets(token, filter ? { status: filter } : {})
            .then(data => setTickets(data.tickets))
            .catch(err => { console.error('[SupportTab]', err); setError('Failed to load tickets.'); });
    }, [token, filter]);

    useEffect(() => { load(); }, [load]);

    async function updateTicket(id, data) {
        try {
            setSending(true);
            const { ticket } = await adminUpdateTicket(token, id, data);
            toast.success('Ticket updated');
            setSelected(ticket);
            load();
        } catch { toast.error('Failed to update ticket'); }
        finally { setSending(false); }
    }

    return (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 360px' : '1fr', gap: 20, alignItems: 'start' }}>
            <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <h2 style={{ fontWeight: 700, margin: 0, fontSize: '1.05rem' }}>Support Tickets</h2>
                    <select value={filter} onChange={e => setFilter(e.target.value)}
                        style={{ padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                        <option value="">All</option>
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                    </select>
                </div>

                {error ? (
                    <ErrorState message={error} onRetry={load} />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {tickets.length === 0 && (
                            <div style={{ color: 'var(--text-secondary)', padding: '30px 0', textAlign: 'center' }}>No tickets found.</div>
                        )}
                        {tickets.map(t => {
                            const badge = STATUS_BADGE[t.status] || STATUS_BADGE.open;
                            const BadgeIcon = badge.icon;
                            const isActive = selected?.id === t.id;
                            return (
                                <div key={t.id}
                                    onClick={() => { setSelected(t); setReplyText(t.admin_reply || ''); }}
                                    style={{
                                        background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: '13px 16px', cursor: 'pointer',
                                        border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border-primary)'}`,
                                        boxShadow: isActive ? '0 0 0 3px rgba(0,120,212,0.1)' : 'var(--shadow-card)',
                                        transition: 'all var(--transition-fast)',
                                    }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>#{t.id} — {t.subject}</div>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: 2 }}>
                                                {t.name}  {t.email}
                                            </div>
                                        </div>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: badge.bg, color: badge.color, padding: '3px 10px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 }}>
                                            <BadgeIcon size={10} /> {badge.label}
                                        </span>
                                    </div>
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {t.message}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {selected && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', padding: 20, position: 'sticky', top: 64, boxShadow: 'var(--shadow-md)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <h3 style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>Ticket #{selected.id}</h3>
                        <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                            <X size={15} />
                        </button>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>From</div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{selected.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{selected.email}</div>
                    </div>
                    <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Message</div>
                        <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: '0.85rem', whiteSpace: 'pre-wrap', lineHeight: 1.55, maxHeight: 160, overflowY: 'auto' }}>
                            {selected.message}
                        </div>
                    </div>
                    <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 6 }}>Reply</label>
                        <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={4}
                            placeholder="Type your reply..."
                            style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.85rem', resize: 'vertical', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <select value={selected.status} onChange={e => updateTicket(selected.id, { status: e.target.value })}
                            style={{ flex: 1, padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                            <option value="open">Open</option>
                            <option value="in_progress">In Progress</option>
                            <option value="resolved">Resolved</option>
                        </select>
                        <button onClick={() => updateTicket(selected.id, { admin_reply: replyText })} disabled={sending}
                            style={{ padding: '7px 16px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 7, cursor: sending ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem', opacity: sending ? 0.7 : 1 }}>
                            {sending ? 'Saving...' : 'Reply'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

//  Data Sync / Maintenance Tab 
function SyncTab({ token }) {
    const [stats, setStats]           = useState(null);
    const [statsErr, setStatsErr]     = useState(null);
    const [recentJobs, setRecentJobs] = useState([]);
    const [activeJob, setActiveJob]   = useState(null);
    const [runningKey, setRunningKey] = useState(null);
    const logRef = useRef(null);

    const loadStats = useCallback(async () => {
        try {
            const data = await adminGetSyncStats(token);
            setStats(data);
            setStatsErr(null);
        } catch {
            setStatsErr('Failed to load data status.');
        }
    }, [token]);

    const loadJobs = useCallback(async () => {
        try {
            const data = await adminGetSyncJobs(token);
            setRecentJobs(data.jobs || []);
        } catch {}
    }, [token]);

    useEffect(() => { loadStats(); loadJobs(); }, [loadStats, loadJobs]);

    // Poll active job every 2s while running
    useEffect(() => {
        if (!activeJob || activeJob.status !== 'running') return;
        const jobId = activeJob.id;
        const t = setInterval(async () => {
            try {
                const data = await adminGetSyncJob(token, jobId);
                setActiveJob(data);
                if (data.status !== 'running') { loadStats(); loadJobs(); }
            } catch {}
        }, 2000);
        return () => clearInterval(t);
    }, [activeJob?.id, activeJob?.status, token, loadStats, loadJobs]);

    // Auto-scroll log to bottom as lines come in
    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [activeJob?.logs?.length]);

    async function runAction(key, label) {
        if (runningKey) return;
        setRunningKey(key);
        try {
            const { jobId } = await adminRunSync(token, key);
            setActiveJob({ id: jobId, action: key, label, status: 'running', logs: [], startedAt: new Date().toISOString() });
            toast.success(`${label} started`);
        } catch (err) {
            toast.error(`Failed to start: ${err.message}`);
        } finally {
            setRunningKey(null);
        }
    }

    async function openJob(jobId) {
        try {
            const data = await adminGetSyncJob(token, jobId);
            setActiveJob(data);
        } catch {}
    }

    function dur(start, end) {
        if (!end) return null;
        const ms = new Date(end) - new Date(start);
        return ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${(ms / 60000).toFixed(1)}m`;
    }
    function ago(d) {
        if (!d) return '—';
        const s = (Date.now() - new Date(d)) / 1000;
        if (s < 60) return 'just now';
        if (s < 3600) return `${Math.floor(s / 60)}m ago`;
        if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
        return `${Math.floor(s / 86400)}d ago`;
    }

    const ACTIONS = [
        { key: 'quick_sync',      label: 'Quick Sync',          badge: 'JS',     color: '#0078d4', icon: Zap,        desc: 'Fast: 5 services, INR, Central India' },
        { key: 'full_sync',       label: 'Full Price Sync',      badge: 'JS',     color: '#7c3aed', icon: RefreshCw,  desc: 'All 27 services × 20 regions × 4 currencies' },
        { key: 'python_prices',   label: 'Update Prices',        badge: 'Python', color: '#059669', icon: TrendingUp, desc: 'Fetch latest Azure retail prices from Azure API' },
        { key: 'python_currency', label: 'Update Currencies',    badge: 'Python', color: '#0891b2', icon: DollarSign, desc: 'Derive exchange rates via Azure reference SKUs' },
        { key: 'python_vm_types', label: 'Update VM Types',      badge: 'Python', color: '#6366f1', icon: Server,     desc: 'Download VM specs (CPU, GPU, memory) from CloudPrice' },
    ];

    const JOB_COLOR = { running: '#f59e0b', completed: '#10b981', failed: '#ef4444' };
    const JOB_ICON  = {
        running:   <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} />,
        completed: <CheckCircle size={11} />,
        failed:    <AlertCircle size={11} />,
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ── Data Status ── */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', padding: '20px 22px', boxShadow: 'var(--shadow-card)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Database size={15} style={{ color: 'var(--accent)' }} />
                        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Current Data Status</span>
                    </div>
                    <button onClick={loadStats} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem' }}>
                        <RefreshCw size={12} /> Refresh
                    </button>
                </div>

                {statsErr ? (
                    <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>{statsErr}</div>
                ) : !stats ? (
                    <Spinner />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {/* Metric cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                            {[
                                { label: 'Total Prices',      value: stats.prices.total.toLocaleString(),   sub: `${stats.prices.active.toLocaleString()} active`,         color: '#059669' },
                                { label: 'Last Price Update', value: ago(stats.prices.lastUpdated),         sub: stats.prices.lastUpdated ? new Date(stats.prices.lastUpdated).toLocaleDateString() : 'Never', color: '#0078d4' },
                                { label: 'VM Types',          value: stats.vmTypes.total.toLocaleString(),  sub: `Updated ${ago(stats.vmTypes.lastUpdated)}`,              color: '#6366f1' },
                                { label: 'Currencies Stored', value: stats.currencies?.length || 0,         sub: 'Exchange rates vs USD',                                  color: '#0891b2' },
                            ].map(m => (
                                <div key={m.label} style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', borderLeft: `3px solid ${m.color}` }}>
                                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{m.label}</div>
                                    <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{m.value}</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>{m.sub}</div>
                                </div>
                            ))}
                        </div>

                        {/* Currency rate chips */}
                        {stats.currencies?.length > 0 && (
                            <div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                                    Exchange Rates (USD = 1.0)
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {stats.currencies.map(c => (
                                        <div key={c.currency_code} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg-tertiary)', borderRadius: 99, padding: '4px 10px', fontSize: '0.78rem' }}>
                                            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{c.currency_code}</span>
                                            <span style={{ color: 'var(--text-secondary)' }}>{parseFloat(c.rate_from_usd).toFixed(4)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Run Sync Job ── */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', padding: '20px 22px', boxShadow: 'var(--shadow-card)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <Play size={15} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Run Sync Job</span>
                    {activeJob?.status === 'running' && (
                        <span style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600 }}>⚡ A job is running — other buttons are disabled</span>
                    )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))', gap: 10 }}>
                    {ACTIONS.map(a => {
                        const AIcon = a.icon;
                        const isRunning    = activeJob?.action === a.key && activeJob?.status === 'running';
                        const isTriggering = runningKey === a.key;
                        const busy = isRunning || isTriggering || (!!(activeJob?.status === 'running') && activeJob?.action !== a.key);
                        return (
                            <div key={a.key} style={{
                                background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '14px 16px',
                                border: `1px solid ${isRunning ? a.color : 'var(--border-primary)'}`,
                                boxShadow: isRunning ? `0 0 0 3px ${a.color}22` : 'none',
                                transition: 'all 0.15s',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                                    <div style={{ width: 34, height: 34, borderRadius: 9, background: `${a.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <AIcon size={16} style={{ color: a.color }} />
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{a.label}</span>
                                            <span style={{ background: `${a.color}20`, color: a.color, fontSize: '0.63rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99 }}>{a.badge}</span>
                                        </div>
                                        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{a.desc}</div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => runAction(a.key, a.label)}
                                    disabled={busy}
                                    style={{
                                        width: '100%', padding: '7px 12px',
                                        background: isRunning ? `${a.color}15` : a.color,
                                        color: isRunning ? a.color : 'white',
                                        border: isRunning ? `1px solid ${a.color}` : 'none',
                                        borderRadius: 'var(--radius-sm)',
                                        cursor: busy ? 'not-allowed' : 'pointer',
                                        opacity: busy && !isRunning && !isTriggering ? 0.4 : 1,
                                        fontWeight: 600, fontSize: '0.82rem',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {isRunning || isTriggering ? (
                                        <><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> {isRunning ? 'Running...' : 'Starting...'}</>
                                    ) : (
                                        <><Play size={12} /> Run</>
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Active / Last Job Log ── */}
            {activeJob && (
                <div style={{ background: 'var(--bg-card)', border: `1px solid ${JOB_COLOR[activeJob.status] || 'var(--border-primary)'}`, borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
                    <div style={{ background: 'var(--bg-secondary)', padding: '11px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Terminal size={14} style={{ color: 'var(--accent)' }} />
                            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{activeJob.label}</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: `${JOB_COLOR[activeJob.status]}20`, color: JOB_COLOR[activeJob.status], padding: '3px 9px', borderRadius: 99, fontSize: '0.71rem', fontWeight: 700 }}>
                                {JOB_ICON[activeJob.status]} {activeJob.status}
                            </span>
                            {activeJob.finishedAt && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Duration: {dur(activeJob.startedAt, activeJob.finishedAt)}</span>
                            )}
                        </div>
                        <button onClick={() => setActiveJob(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                            <X size={14} />
                        </button>
                    </div>
                    <div ref={logRef} style={{ background: '#0d1117', color: '#c9d1d9', fontFamily: 'monospace', fontSize: '0.78rem', lineHeight: 1.65, padding: '14px 16px', maxHeight: 320, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {!activeJob.logs?.length ? (
                            <span style={{ color: '#484f58' }}>Waiting for output...</span>
                        ) : (
                            activeJob.logs.map((line, i) => (
                                <div key={i} style={{ color: line.startsWith('[error]') ? '#f85149' : line.startsWith('[done]') ? '#3fb950' : line.startsWith('[start]') || line.startsWith('[info]') ? '#58a6ff' : line.startsWith('[stderr]') ? '#f0883e' : '#c9d1d9' }}>
                                    {line}
                                </div>
                            ))
                        )}
                        {activeJob.status === 'running' && <div style={{ color: '#484f58', marginTop: 4 }}>▌</div>}
                    </div>
                </div>
            )}

            {/* ── Recent Jobs History ── */}
            {recentJobs.length > 0 && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-primary)', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Activity size={14} style={{ color: 'var(--text-secondary)' }} /> Recent Jobs
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400 }}>— click a row to view logs</span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-tertiary)' }}>
                                {['Action', 'Status', 'Started', 'Duration'].map(h => (
                                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {recentJobs.map(j => (
                                <tr key={j.id}
                                    onClick={() => openJob(j.id)}
                                    style={{ borderTop: '1px solid var(--border-primary)', cursor: 'pointer', transition: 'background 0.1s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <td style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--text-primary)' }}>{j.label}</td>
                                    <td style={{ padding: '10px 14px' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: `${JOB_COLOR[j.status] || '#6b7280'}20`, color: JOB_COLOR[j.status] || '#6b7280', padding: '2px 8px', borderRadius: 99, fontSize: '0.71rem', fontWeight: 700 }}>
                                            {JOB_ICON[j.status]} {j.status}
                                        </span>
                                    </td>
                                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{ago(j.startedAt)}</td>
                                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                                        {dur(j.startedAt, j.finishedAt) || (j.status === 'running' ? <span style={{ color: '#f59e0b' }}>running…</span> : '—')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

//  Main Admin Page 
export default function AdminPage() {
    const { user, token } = useAuth();
    const navigate = useNavigate();
    const [tab, setTab]         = useState('dashboard');
    const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('admin_unlocked') === '1');

    useEffect(() => {
        if (!user) navigate('/login');
    }, [user, navigate]);

    if (!user)     return null;
    if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;

    return (
        <div style={{ padding: '28px 32px 60px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
                <div>
                    <h1 style={{ fontWeight: 800, fontSize: '1.6rem', margin: '0 0 4px', color: 'var(--text-primary)' }}>Admin Panel</h1>
                    <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.85rem' }}>
                        Manage customers, subscriptions, and support.
                    </p>
                </div>
                <button
                    onClick={() => { sessionStorage.removeItem('admin_unlocked'); setUnlocked(false); }}
                    style={{ padding: '7px 14px', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, transition: 'all var(--transition-fast)' }}>
                    <Lock size={13} /> Lock
                </button>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 2, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', padding: 3, marginBottom: 26, width: 'fit-content' }}>
                {TABS.map(t => {
                    const TIcon = t.icon;
                    const active = tab === t.id;
                    return (
                        <button key={t.id} onClick={() => setTab(t.id)}
                            style={{
                                padding: '7px 16px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
                                background: active ? 'var(--accent)' : 'transparent',
                                color: active ? 'white' : 'var(--text-secondary)',
                                fontWeight: 600, fontSize: '0.85rem',
                                display: 'flex', alignItems: 'center', gap: 6,
                                transition: 'all var(--transition-fast)',
                                boxShadow: active ? 'var(--shadow-sm)' : 'none',
                            }}>
                            <TIcon size={14} /> {t.label}
                        </button>
                    );
                })}
            </div>

            {tab === 'dashboard' && <DashboardTab token={token} />}
            {tab === 'users'     && <UsersTab     token={token} />}
            {tab === 'support'   && <SupportTicketsTab token={token} />}
            {tab === 'sync'      && <SyncTab     token={token} />}
        </div>
    );
}
