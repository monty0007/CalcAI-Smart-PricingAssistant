import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { LayoutDashboard, Bot, Sun, Moon, Home, Server } from 'lucide-react';
import { EstimateProvider, useEstimate } from './context/EstimateContext';
import { useAuth } from './context/AuthContext';
import { AZURE_REGIONS } from './data/serviceCatalog';
import { SUPPORTED_CURRENCIES } from './services/azurePricingApi';
import CalculatorPage from './pages/CalculatorPage';
import LandingPage from './pages/LandingPage';
import AiPage from './pages/AiPage';
import VmComparisonPage from './pages/VmComparisonPage';
import './index.css';

function Navbar() {
  const { currency, setCurrency, region, setRegion, items } = useEstimate();
  const { user, logout } = useAuth();
  const location = useLocation();
  const isHome = location.pathname === '/';

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('azure-theme') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('azure-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  if (location.pathname === '/login') return null;

  return (
    <nav className="navbar">
      <NavLink to="/" className="navbar-brand">
        <div className="logo-icon">Ca</div>
        <span>CalcAI</span>
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
            {user ? (
              <NavLink to="/my-estimates" className={({ isActive }) => isActive ? 'active' : ''}>
                <Home size={15} />
                My Estimates
              </NavLink>
            ) : null}
          </>
        )}
      </div>

      <div className="navbar-controls">
        {!isHome && !user && location.pathname !== '/login' && (
          <NavLink to="/login" className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem', marginRight: 8 }}>
            Login
          </NavLink>
        )}

        {isHome && !user && (
          <NavLink to="/login" className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.9rem' }}>
            Sign In
          </NavLink>
        )}

        {user && (
          <div className="user-menu" style={{ fontSize: '0.85rem', fontWeight: 500, marginRight: 8 }}>
            Hi, {user.name?.split(' ')[0] || 'User'}
            <button onClick={logout} className="btn-link" style={{ marginLeft: 8, fontSize: '0.8rem', opacity: 0.8 }}>Logout</button>
          </div>
        )}

        {!isHome && location.pathname !== '/login' && (
          <>
            <select
              className="select-control"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              aria-label="Select region"
            >
              {AZURE_REGIONS.map(r => (
                <option key={r.code} value={r.code}>{r.name}</option>
              ))}
            </select>

            <select
              className="select-control"
              value={currency}
              onChange={(e) => setCurrency(e.target.value, items)}
              aria-label="Select currency"
            >
              {SUPPORTED_CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
              ))}
            </select>

            <button
              className="theme-toggle"
              onClick={toggleTheme}
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
          </>
        )}
      </div>
    </nav>
  );
}

import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import MyEstimates from './pages/MyEstimates';

// Placeholder Client ID - User must update .env
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <BrowserRouter>
          <EstimateProvider>
            <Navbar />
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/dashboard" element={<CalculatorPage />} />
              <Route path="/vms" element={<VmComparisonPage />} />
              <Route path="/ai" element={<AiPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/my-estimates" element={<MyEstimates />} />
            </Routes>
          </EstimateProvider>
        </BrowserRouter>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
