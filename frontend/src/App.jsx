import { BrowserRouter, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, Bot, Sun, Moon, Home, Server, UserCircle2, LogOut, ChevronDown } from 'lucide-react';
import { EstimateProvider, useEstimate } from './context/EstimateContext';
import { useAuth } from './context/AuthContext';
import { AZURE_REGIONS } from './data/serviceCatalog';
import { SUPPORTED_CURRENCIES } from './services/azurePricingApi';
import CalculatorPage from './pages/CalculatorPage';
import LandingPage from './pages/LandingPage';
import AiPage from './pages/AiPage';
import VmComparisonPage from './pages/VmComparisonPage';
import Logo from './components/Logo';
import './index.css';

function Navbar() {
  const { currency, setCurrency, region, setRegion, items } = useEstimate();
  const { user, logout } = useAuth();
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

        {/* Login Button positioned at the end (right corner) */}
        {!user && location.pathname !== '/login' && (
          <NavLink
            to="/login"
            className="btn-primary"
            style={{
              padding: isHome ? '8px 20px' : '6px 16px',
              fontSize: '0.9rem',
              marginLeft: 8,
              background: 'var(--accent)', /* Ensure it uses the primary blue */
              color: 'white',
              border: 'none'
            }}
          >
            {isHome ? 'Sign In' : 'Login'}
          </NavLink>
        )}

        {user && (
          <div className="user-profile-menu" ref={profileRef}>
            <button
              className="user-profile-trigger"
              onClick={() => setProfileOpen(prev => !prev)}
              title={user.name || 'Profile'}
            >
              <div className="user-avatar">
                {user.photoURL
                  ? <img src={user.photoURL} alt="avatar" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                  : <UserCircle2 size={22} />
                }
              </div>
              <span className="user-name-label">{user.name?.split(' ')[0] || 'User'}</span>
              <ChevronDown size={14} style={{ opacity: 0.6 }} />
            </button>
            {profileOpen && (
              <div className="user-dropdown">
                <div className="user-dropdown-info">
                  <strong>{user.name?.split(' ')[0] || 'User'}</strong>
                  <span>{user.email}</span>
                </div>
                <hr className="user-dropdown-divider" />
                <button className="user-dropdown-item danger" onClick={() => { setProfileOpen(false); logout(); navigate('/'); }}>
                  <LogOut size={14} /> Logout
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}

import { AuthProvider } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import MyEstimates from './pages/MyEstimates';
import { Toaster } from 'react-hot-toast';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <EstimateProvider>
          <Toaster position="bottom-right" />
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
  );
}

export default App;
