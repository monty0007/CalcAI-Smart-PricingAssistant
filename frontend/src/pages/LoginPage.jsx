import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { GoogleLogin } from '@react-oauth/google';
import { useNavigate, Link } from 'react-router-dom';

export default function LoginPage() {
    const { login, signup, googleLogin } = useAuth(); // Removed loading
    const navigate = useNavigate();
    const [isSignup, setIsSignup] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        try {
            if (isSignup) {
                await signup(email, password, name);
            } else {
                await login(email, password);
            }
            navigate('/dashboard'); // Or previous page
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="auth-container">
            {/* Left Side: Branding & Visuals */}
            <div className="auth-visuals">
                <div className="visuals-content">
                    <div className="logo-badge">
                        <div className="logo-icon-lg">Ca</div>
                        <span>CalcAI</span>
                    </div>
                    <h1>Estimate Azure costs<br />smarter, faster.</h1>
                    <p>
                        Get real-time pricing, compare virtual machines,
                        and manage your cloud budget with confidence.
                    </p>
                    <div className="visual-features">
                        <div className="visual-feature-item">✓ Real-time Azure Retail Prices</div>
                        <div className="visual-feature-item">✓ Intelligent VM Comparisons</div>
                        <div className="visual-feature-item">✓ Save & Export Estimates</div>
                    </div>
                </div>
            </div>

            {/* Right Side: Login Form */}
            <div className="auth-form-side">
                <div className="auth-card-minimal">
                    <div className="auth-header">
                        <h2>{isSignup ? 'Create Account' : 'Welcome Back'}</h2>
                        <p className="auth-subtitle">
                            {isSignup ? 'Enter your details to get started' : 'Sign in to access your estimates'}
                        </p>
                    </div>

                    {error && <div className="auth-error">{error}</div>}

                    <form onSubmit={handleSubmit} className="auth-form">
                        {isSignup && (
                            <div className="form-group">
                                <label>Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    placeholder="John Doe"
                                />
                            </div>
                        )}
                        <div className="form-group">
                            <label>Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                placeholder="name@company.com"
                            />
                        </div>
                        <div className="form-group">
                            <label>Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                placeholder="••••••••"
                            />
                        </div>

                        <button type="submit" className="btn-primary auth-submit">
                            {isSignup ? 'Sign Up' : 'Sign In'}
                        </button>
                    </form>

                    <div className="auth-divider">
                        <span>OR CONTINUE WITH</span>
                    </div>

                    <div className="google-btn-wrapper">
                        <GoogleLogin
                            onSuccess={async (credentialResponse) => {
                                try {
                                    await googleLogin(credentialResponse);
                                    navigate('/dashboard');
                                } catch (err) {
                                    setError('Google login failed');
                                }
                            }}
                            onError={() => {
                                setError('Google Login Failed');
                            }}
                        />
                    </div>

                    <div className="auth-footer">
                        {isSignup ? "Already have an account?" : "Don't have an account?"}
                        <button
                            className="btn-link"
                            onClick={() => setIsSignup(!isSignup)}
                        >
                            {isSignup ? 'Sign In' : 'Sign Up'}
                        </button>
                    </div>
                </div>
            </div>

            <style jsx>{`
                .auth-container {
                    display: flex;
                    height: calc(100vh - 56px); /* Subtract navbar height */
                    width: 100vw;
                    overflow: hidden;
                    background: var(--bg-primary);
                }

                /* Left Side */
                .auth-visuals {
                    flex: 1;
                    background: var(--bg-tertiary);
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    padding: 4rem;
                    position: relative;
                    border-right: 1px solid var(--border-primary);
                }
                
                .visuals-content {
                    max-width: 480px;
                    margin: 0 auto;
                }

                .logo-badge {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 2rem;
                    font-weight: 700;
                    font-size: 1.25rem;
                    color: var(--text-primary);
                }

                .logo-icon-lg {
                    font-size: 1.2rem;
                    font-weight: 800;
                    background: var(--gradient-primary);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    border: 2px solid var(--accent);
                    border-radius: 8px;
                    padding: 4px 8px;
                }

                .auth-visuals h1 {
                    font-size: 3rem;
                    line-height: 1.1;
                    font-weight: 800;
                    color: var(--text-primary);
                    margin-bottom: 1.5rem;
                    letter-spacing: -0.02em;
                }

                .auth-visuals p {
                    font-size: 1.1rem;
                    color: var(--text-secondary);
                    line-height: 1.6;
                    margin-bottom: 2.5rem;
                }

                .visual-features {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }

                .visual-feature-item {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-size: 1rem;
                    color: var(--text-primary);
                    font-weight: 500;
                }

                /* Right Side */
                .auth-form-side {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    padding: 2rem;
                    background: var(--bg-primary);
                    overflow-y: auto;
                    height: 100%;
                    position: relative;
                }

                .auth-card-minimal {
                    width: 100%;
                    max-width: 400px;
                    margin: auto;
                    padding: 2rem 0;
                }

                .auth-header {
                    margin-bottom: 2rem;
                    text-align: center;
                    position: relative;
                }

                .auth-header h2 {
                    font-size: 1.75rem;
                    font-weight: 700;
                    color: var(--text-primary);
                    margin-bottom: 0.5rem;
                }

                .auth-subtitle {
                    color: var(--text-secondary);
                    font-size: 0.95rem;
                }

                .auth-error {
                    background: rgba(239, 68, 68, 0.1);
                    color: var(--danger);
                    border: 1px solid rgba(239, 68, 68, 0.2);
                    padding: 0.75rem;
                    border-radius: var(--radius-md);
                    font-size: 0.9rem;
                    margin-bottom: 1.5rem;
                    text-align: center;
                }

                .form-group {
                    margin-bottom: 1.25rem;
                }

                .form-group label {
                    display: block;
                    margin-bottom: 0.5rem;
                    font-size: 0.9rem;
                    color: var(--text-primary);
                    font-weight: 500;
                }

                .form-group input {
                    width: 100%;
                    padding: 0.85rem 1rem;
                    border: 1px solid var(--border-primary);
                    border-radius: var(--radius-md);
                    background: var(--bg-input);
                    color: var(--text-primary);
                    font-size: 0.95rem;
                    transition: all 0.2s;
                }

                .form-group input:focus {
                    outline: none;
                    border-color: var(--accent);
                    box-shadow: 0 0 0 3px rgba(0, 120, 212, 0.1);
                    background: var(--bg-secondary);
                }

                .auth-submit {
                    width: 100%;
                    margin-top: 0.5rem;
                    padding: 0.85rem;
                    font-size: 1rem;
                    font-weight: 600;
                    border-radius: var(--radius-md);
                }

                .auth-divider {
                    display: flex;
                    align-items: center;
                    margin: 2rem 0;
                    color: var(--text-muted);
                    font-size: 0.75rem;
                    font-weight: 600;
                    letter-spacing: 0.05em;
                    text-transform: uppercase;
                }

                .auth-divider::before, .auth-divider::after {
                    content: '';
                    flex: 1;
                    height: 1px;
                    background: var(--border-primary);
                }

                .auth-divider span {
                    padding: 0 1rem;
                }

                .google-btn-wrapper {
                    display: flex;
                    justify-content: center;
                    margin-bottom: 2rem;
                }

                .auth-footer {
                    text-align: center;
                    font-size: 0.95rem;
                    color: var(--text-secondary);
                }

                .btn-link {
                    background: none;
                    border: none;
                    color: var(--accent);
                    cursor: pointer;
                    margin-left: 0.5rem;
                    font-weight: 600;
                    font-size: 0.95rem;
                }

                .btn-link:hover {
                    text-decoration: underline;
                    color: var(--accent-hover);
                }

                /* Mobile Responsive */
                @media (max-width: 768px) {
                    .auth-visuals {
                        display: none;
                    }
                }
            `}</style>
        </div>
    );
}
