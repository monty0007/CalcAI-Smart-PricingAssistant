import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { GoogleLogin } from '@react-oauth/google';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, CheckCircle, ArrowLeft } from 'lucide-react';

// Microsoft icon SVG
function MicrosoftIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="9" height="9" fill="#f25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
            <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
        </svg>
    );
}

const FEATURES = [
    'Real-time Azure retail prices',
    'Intelligent VM cost comparisons',
    'Save and manage your BOQ estimates',
    'Export to Excel instantly',
];

export default function LoginPage() {
    const { login, signup, googleLogin, microsoftLogin } = useAuth();
    const navigate = useNavigate();

    const [mode, setMode] = useState('login'); // 'login' | 'signup'
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [msLoading, setMsLoading] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            if (mode === 'signup') {
                await signup(email, password, name);
            } else {
                await login(email, password);
            }
            navigate('/dashboard');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleGoogleSuccess(credentialResponse) {
        setError(null);
        try {
            await googleLogin(credentialResponse);
            navigate('/dashboard');
        } catch {
            setError('Google login failed. Please try again.');
        }
    }

    async function handleMicrosoft() {
        setError(null);
        setMsLoading(true);
        try {
            await microsoftLogin();
            navigate('/dashboard');
        } catch (err) {
            setError(err.message || 'Microsoft login failed. Please try again.');
        } finally {
            setMsLoading(false);
        }
    }

    return (
        <div className="auth-page">
            {/* ── Left branding panel ──────────────────────────── */}
            <div className="auth-brand">
                <Link to="/" className="auth-brand-logo">
                    <div className="auth-logo-icon">Ca</div>
                    <span>CalcAI</span>
                </Link>
                <div className="auth-brand-body">
                    <h1 className="auth-brand-title">
                        Estimate Azure costs<br />
                        <span className="auth-brand-gradient">smarter &amp; faster.</span>
                    </h1>
                    <p className="auth-brand-desc">
                        Real-time pricing, intelligent VM comparisons, and BOQ management — all in one place.
                    </p>
                    <ul className="auth-features">
                        {FEATURES.map((f, i) => (
                            <li key={i}><CheckCircle size={16} />{f}</li>
                        ))}
                    </ul>
                </div>
                <div className="auth-brand-footer">
                    &copy; {new Date().getFullYear()} CalcAI · Azure Pricing Intelligence
                </div>
            </div>

            {/* ── Right form panel ─────────────────────────────── */}
            <div className="auth-form-panel">
                <button className="auth-back-btn" onClick={() => navigate(-1)}>
                    <ArrowLeft size={15} /> Back
                </button>
                <div className="auth-form-card">
                    {/* Tab switch */}
                    <div className="auth-tabs">
                        <button
                            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
                            onClick={() => { setMode('login'); setError(null); }}
                        >
                            Sign In
                        </button>
                        <button
                            className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
                            onClick={() => { setMode('signup'); setError(null); }}
                        >
                            Sign Up
                        </button>
                    </div>

                    <h2 className="auth-form-title">
                        {mode === 'login' ? 'Welcome back' : 'Create your account'}
                    </h2>
                    <p className="auth-form-sub">
                        {mode === 'login'
                            ? 'Sign in to access your saved estimates'
                            : 'Start managing Azure costs today'}
                    </p>

                    {/* Error banner */}
                    {error && <div className="auth-error-banner"><span>⚠</span> {error}</div>}

                    {/* Email/password form */}
                    <form onSubmit={handleSubmit} className="auth-form">
                        {mode === 'signup' && (
                            <div className="auth-field">
                                <label>Full Name</label>
                                <div className="auth-input-wrap">
                                    <User size={15} className="auth-field-icon" />
                                    <input
                                        type="text"
                                        placeholder="John Doe"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        required
                                        autoComplete="name"
                                    />
                                </div>
                            </div>
                        )}
                        <div className="auth-field">
                            <label>Email</label>
                            <div className="auth-input-wrap">
                                <Mail size={15} className="auth-field-icon" />
                                <input
                                    type="email"
                                    placeholder="name@company.com"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    required
                                    autoComplete={mode === 'login' ? 'email' : 'username'}
                                />
                            </div>
                        </div>
                        <div className="auth-field">
                            <div className="auth-field-label-row">
                                <label>Password</label>
                                {mode === 'login' && (
                                    <button type="button" className="auth-forgot">Forgot password?</button>
                                )}
                            </div>
                            <div className="auth-input-wrap">
                                <Lock size={15} className="auth-field-icon" />
                                <input
                                    type={showPw ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required
                                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                />
                                <button
                                    type="button"
                                    className="auth-pw-toggle"
                                    onClick={() => setShowPw(v => !v)}
                                    tabIndex={-1}
                                >
                                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                        </div>

                        <button type="submit" className="auth-submit-btn" disabled={loading}>
                            {loading ? <span className="auth-spinner" /> : <ArrowRight size={16} />}
                            {loading
                                ? (mode === 'login' ? 'Signing in…' : 'Creating account…')
                                : (mode === 'login' ? 'Sign In' : 'Create Account')}
                        </button>
                    </form>

                    {/* Divider */}
                    <div className="auth-divider"><span>or continue with</span></div>

                    {/* OAuth buttons */}
                    <div className="auth-oauth-row">
                        {/* Google — uses the @react-oauth/google component rendered invisible then triggered */}
                        <div className="auth-oauth-btn-wrap google">
                            <GoogleLogin
                                onSuccess={handleGoogleSuccess}
                                onError={() => setError('Google Login Failed')}
                                useOneTap={false}
                                render={renderProps => (
                                    <button
                                        className="auth-oauth-btn"
                                        onClick={renderProps.onClick}
                                        disabled={renderProps.disabled}
                                    >
                                        <svg width="18" height="18" viewBox="0 0 48 48">
                                            <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.3 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 20-19.9.1-.7.1-2.7-.4-4.1z" />
                                            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.8 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4 24 4 16.3 4 9.7 8.4 6.3 14.7z" />
                                            <path fill="#4CAF50" d="M24 44c5.2 0 10-1.9 13.6-5l-6.3-5.3C29.5 35.5 26.9 36 24 36c-5.2 0-9.6-3.5-11.2-8.2l-6.5 5C9.7 39.6 16.3 44 24 44z" />
                                            <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.4 4.3-4.5 5.7l6.3 5.3C41.3 35.7 44 30.3 44 24c0-1.3-.1-2.7-.4-4z" />
                                        </svg>
                                        Google
                                    </button>
                                )}
                            />
                        </div>

                        <button
                            className="auth-oauth-btn"
                            onClick={handleMicrosoft}
                            disabled={msLoading}
                        >
                            {msLoading ? <span className="auth-spinner" /> : <MicrosoftIcon />}
                            Microsoft
                        </button>
                    </div>

                    <p className="auth-switch-text">
                        {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
                        {' '}
                        <button
                            className="auth-switch-btn"
                            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); }}
                        >
                            {mode === 'login' ? 'Sign Up' : 'Sign In'}
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
}
