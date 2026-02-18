import { Link } from 'react-router-dom';
import {
    ArrowRight, Sparkles, Zap, Globe, Shield, Brain,
    BarChart3, Clock, Database, Cpu, TrendingUp, Check
} from 'lucide-react';

const FEATURES = [
    { icon: Zap, title: 'Real-Time Pricing', desc: 'Cached daily from Azure Retail Prices API — always accurate, never rate-limited' },
    { icon: Brain, title: 'AI Assistant', desc: 'Ask in natural language — "How much is a D4 v3 in East US?" and get instant answers' },
    { icon: Globe, title: 'Multi-Region & Currency', desc: '20+ Azure regions and 10 currencies including USD, INR, EUR, GBP' },
    { icon: Shield, title: 'Savings Comparison', desc: 'Compare Pay-as-you-go, Savings Plans, and Reserved Instances side by side' },
    { icon: BarChart3, title: 'Cost Breakdown', desc: 'Detailed breakdown — Compute, OS licensing, Managed Disks, Bandwidth' },
    { icon: Clock, title: 'Nightly Sync', desc: 'Pricing data refreshes automatically at midnight — always up to date' },
];

const SERVICES_SHOWCASE = [
    { name: 'Virtual Machines', icon: Cpu, color: '#0078d4' },
    { name: 'SQL Database', icon: Database, color: '#6366f1' },
    { name: 'App Service', icon: Globe, color: '#10b981' },
    { name: 'Kubernetes', icon: TrendingUp, color: '#8b5cf6' },
];

export default function LandingPage() {
    return (
        <div className="landing-page">
            {/* ── Hero ────────────────────────── */}
            <section className="landing-hero">
                <div className="landing-hero-glow glow-1" />
                <div className="landing-hero-glow glow-2" />

                <div className="landing-hero-content">
                    <div className="landing-badge">
                        <Sparkles size={14} />
                        <span>AI-Powered Cloud Pricing</span>
                    </div>

                    <h1 className="landing-title">
                        Estimate Azure costs
                        <br />
                        <span className="gradient-text">smarter, faster.</span>
                    </h1>

                    <p className="landing-subtitle">
                        CalcAI brings real-time Azure pricing, intelligent comparisons, savings plan analysis,
                        and an AI assistant — all in one sleek dashboard.
                    </p>

                    <div className="landing-cta">
                        <Link to="/dashboard" className="cta-primary">
                            Open Dashboard
                            <ArrowRight size={18} />
                        </Link>
                        <Link to="/ai" className="cta-secondary">
                            <Brain size={16} />
                            Try AI Assistant
                        </Link>
                    </div>

                    {/* Services mini-showcase */}
                    <div className="landing-services-row">
                        {SERVICES_SHOWCASE.map(s => (
                            <div key={s.name} className="landing-service-chip">
                                <s.icon size={14} style={{ color: s.color }} />
                                <span>{s.name}</span>
                            </div>
                        ))}
                        <span className="landing-more">+100 more</span>
                    </div>
                </div>
            </section>

            {/* ── Features ────────────────────── */}
            <section className="landing-features">
                <div className="landing-features-inner">
                    <h2 className="landing-section-title">
                        Everything you need to
                        <span className="gradient-text"> estimate costs</span>
                    </h2>
                    <p className="landing-section-desc">
                        Stop guessing. CalcAI gives you the tools to plan your Azure spend with confidence.
                    </p>

                    <div className="features-grid">
                        {FEATURES.map((f, i) => (
                            <div key={i} className="feature-card" style={{ animationDelay: `${i * 0.08}s` }}>
                                <div className="feature-icon-wrap">
                                    <f.icon size={20} />
                                </div>
                                <h3>{f.title}</h3>
                                <p>{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── How It Works ─────────────────── */}
            <section className="landing-how">
                <div className="landing-how-inner">
                    <h2 className="landing-section-title">How it works</h2>
                    <div className="how-steps">
                        {[
                            { step: '1', title: 'Choose a service', desc: 'Browse or search from 100+ Azure services' },
                            { step: '2', title: 'Configure pricing', desc: 'Select region, savings plan, OS, and add-ons' },
                            { step: '3', title: 'View breakdown', desc: 'See monthly & yearly totals with detailed cost lines' },
                        ].map((s, i) => (
                            <div key={i} className="how-step-card">
                                <div className="how-step-number">{s.step}</div>
                                <h3>{s.title}</h3>
                                <p>{s.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── CTA ──────────────────────────── */}
            <section className="landing-bottom-cta">
                <h2>Ready to estimate?</h2>
                <p>Start building your Azure cost estimate in seconds.</p>
                <Link to="/dashboard" className="cta-primary cta-lg">
                    Get Started — Free
                    <ArrowRight size={18} />
                </Link>
            </section>

            {/* ── Footer ───────────────────────── */}
            <footer className="landing-footer">
                <span>CalcAI</span>
                <span className="footer-sep">·</span>
                <span>Powered by Azure Retail Prices API</span>
            </footer>
        </div>
    );
}
