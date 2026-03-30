import { BrowserRouter, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, Bot, Sun, Moon, Home, Server, UserCircle2, LogOut, ChevronDown, Globe, Banknote, Check, Tag, HelpCircle, CreditCard, ShieldCheck } from 'lucide-react';
import { EstimateProvider, useEstimate } from './context/EstimateContext';
import { useAuth } from './context/AuthContext';
import { AZURE_REGIONS } from './data/serviceCatalog';
import { SUPPORTED_CURRENCIES } from './services/azurePricingApi';
import CalculatorPage from './pages/CalculatorPage';
import LandingPage from './pages/LandingPage';
import AiPage from './pages/AiPage';
import VmComparisonPage from './pages/VmComparisonPage';
import PricingPage from './pages/PricingPage';
import BillingPage from './pages/BillingPage';
import AdminPage from './pages/AdminPage';
import SupportPage from './pages/SupportPage';
import Logo from './components/Logo';
import './index.css';

function NavbarDropdown({ value, options, onChange, icon: Icon, ariaLabel }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value) || options[0];

  return (
    <div className="navbar-dropdown-container" ref={dropdownRef}>
      <button
        className="navbar-dropdown-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={ariaLabel}
      >
        {Icon && <Icon size={14} className="navbar-dropdown-icon" />}
        <span className="navbar-dropdown-label">{selectedOption?.label}</span>
        <ChevronDown size={14} className={`navbar-dropdown-chevron ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="navbar-dropdown-menu">
          {options.map(opt => (
            <button
              key={opt.value}
              className={`navbar-dropdown-item ${opt.value === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
            >
              <span>{opt.label}</span>
              {opt.value === value && <Check size={14} className="navbar-dropdown-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Navbar() {
  const { currency, setCurrency, region, setRegion, items } = useEstimate();
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === '/';
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('azure-theme') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('azure-theme', theme);
  }, [theme]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  if (location.pathname === '/login') return null;

  return (
    <nav className="navbar">
      <NavLink to="/" className="navbar-brand" style={{ padding: '4px 0', textDecoration: 'none' }}>
        <Logo variant={theme === 'light' ? 'light' : 'dark'} />
      </NavLink>

      <div className="navbar-links">
        {!isHome && (
          <>
            <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''}>
              <LayoutDashboard size={15} />
              Dashboard
            </NavLink>
            <NavLink to="/vms" className={({ isActive }) => isActive ? 'active' : ''}>
              <Server size={15} />
              VM Comparison
            </NavLink>
            <NavLink to="/ai" className={({ isActive }) => isActive ? 'active' : ''}>
              <Bot size={15} />
              AI Assistant
            </NavLink>
            {loading ? (
              <div style={{ width: 100, opacity: 0 }} /> // Placeholder to prevent layout shift
            ) : user ? (
              <NavLink to="/my-estimates" className={({ isActive }) => isActive ? 'active' : ''}>
                <Home size={15} />
                My Estimates
              </NavLink>
            ) : null}
            <NavLink to="/pricing" className={({ isActive }) => isActive ? 'active' : ''}>
              <Tag size={15} />
              Pricing
            </NavLink>
          </>
        )}
      </div>

      <div className="navbar-controls">
        {!isHome && location.pathname !== '/login' && (
          <>
            <NavbarDropdown
              value={region}
              options={AZURE_REGIONS.map(r => ({ value: r.code, label: r.name }))}
              onChange={setRegion}
              icon={Globe}
              ariaLabel="Select region"
            />

            <NavbarDropdown
              value={currency}
              options={SUPPORTED_CURRENCIES.map(c => ({ value: c.code, label: `${c.symbol} ${c.code}` }))}
              onChange={(val) => setCurrency(val, items)}
              icon={Banknote}
              ariaLabel="Select currency"
            />

            <button
              className="theme-toggle"
              onClick={toggleTheme}
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <NavLink to="/support" className={({ isActive }) => `navbar-support-link${isActive ? ' active' : ''}`} title="Support">
              <HelpCircle size={17} />
            </NavLink>
          </>
        )}

        {/* Login Button / User Profile */}
        {loading ? (
          <div style={{ width: 80, height: 32 }} /> // Provide empty space while auth resolves
        ) : !user && location.pathname !== '/login' ? (
          <NavLink
            to="/login"
            className="btn-primary"
            style={{
              padding: isHome ? '8px 20px' : '6px 16px',
              fontSize: '0.9rem',
              marginLeft: 8,
              background: 'var(--accent)',
              color: 'white',
              border: 'none'
            }}
          >
            {isHome ? 'Sign In' : 'Login'}
          </NavLink>
        ) : user ? (
          <div className="user-profile-menu" ref={profileRef}>
            <button
              className="user-profile-trigger"
              onClick={() => setProfileOpen(prev => !prev)}
              title={user.name || 'Profile'}
            >
              <div className="user-avatar">
                {user.photoURL
                  ? <img src={user.photoURL} alt="avatar" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                  : <UserCircle2 size={20} />
                }
              </div>
              <div className="user-trigger-info">
                <span className="user-name-label">{user.name?.split(' ')[0] || 'User'}</span>
                <span className={`user-tier-badge user-tier-badge--${user.subscription_tier || 'free'}`}>
                  {user.subscription_tier === 'pro' ? 'Pro' : user.subscription_tier === 'plus' ? 'Plus' : 'Free'}
                </span>
              </div>
              <ChevronDown size={13} className="user-trigger-chevron" />
            </button>
            {profileOpen && (
              <div className="user-dropdown">
                <div className={`user-dropdown-header user-dropdown-header--${user.subscription_tier || 'free'}`}>
                  <div className="user-dropdown-avatar">
                    {user.photoURL
                      ? <img src={user.photoURL} alt="avatar" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                      : <UserCircle2 size={26} />
                    }
                  </div>
                  <div className="user-dropdown-info">
                    <strong>{user.name || 'User'}</strong>
                    <span className="user-dropdown-email">{user.email}</span>
                    <span className={`user-tier-badge user-tier-badge--${user.subscription_tier || 'free'} user-tier-badge--dropdown`}>
                      {user.subscription_tier === 'pro' ? '✦ Pro Plan' : user.subscription_tier === 'plus' ? '✦ Plus Plan' : 'Free Plan'}
                    </span>
                  </div>
                </div>
                <hr className="user-dropdown-divider" />
                <button className="user-dropdown-item" onClick={() => { setProfileOpen(false); navigate('/billing'); }}>
                  <CreditCard size={14} /> Billing
                </button>
                {user.is_admin && (
                  <button className="user-dropdown-item" onClick={() => { setProfileOpen(false); navigate('/admin'); }}>
                    <ShieldCheck size={14} /> Admin Panel
                  </button>
                )}
                <button className="user-dropdown-item danger" onClick={async () => { setProfileOpen(false); await logout(); navigate('/'); }}>
                  <LogOut size={14} /> Logout
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </nav>
  );
}

import { AuthProvider } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import MyEstimates from './pages/MyEstimates';
import { Toaster } from 'react-hot-toast';

function AppContent() {
  const { loading } = useAuth();
  const [showApp, setShowApp] = useState(false);

  useEffect(() => {
    let timer;
    if (!loading) {
      // Add a small delay after auth resolves to debounce rapid reloads
      timer = setTimeout(() => setShowApp(true), 400);
    } else {
      setShowApp(false);
    }
    return () => clearTimeout(timer);
  }, [loading]);

  if (!showApp) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-document)', color: 'var(--accent)' }}>
        <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3, marginBottom: 16 }}></div>
        <div style={{ fontWeight: 600, letterSpacing: 0.5 }}>Loading...</div>
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<CalculatorPage />} />
        <Route path="/vms" element={<VmComparisonPage />} />
        <Route path="/ai" element={<AiPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/my-estimates" element={<MyEstimates />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/support" element={<SupportPage />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <EstimateProvider>
          <Toaster position="top-right" />
          <AppContent />
        </EstimateProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
