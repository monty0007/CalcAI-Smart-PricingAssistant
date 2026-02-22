import { createContext, useContext, useState, useEffect } from 'react';
import { googleLogout } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { PublicClientApplication } from '@azure/msal-browser';

const AuthContext = createContext();

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// ── Microsoft MSAL config ───────────────────────────────────────────
const MSAL_CLIENT_ID = import.meta.env.VITE_MSAL_CLIENT_ID;
const MSAL_TENANT_ID = import.meta.env.VITE_MSAL_TENANT_ID || 'common';

let msalInstance = null;
if (MSAL_CLIENT_ID) {
    const msalConfig = {
        auth: {
            clientId: MSAL_CLIENT_ID,
            authority: `https://login.microsoftonline.com/${MSAL_TENANT_ID}`,
            redirectUri: window.location.origin,
        },
        cache: { cacheLocation: 'sessionStorage' },
    };
    msalInstance = new PublicClientApplication(msalConfig);
    msalInstance.initialize().catch(() => null);
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (token) {
            try {
                const decoded = jwtDecode(token);
                setUser({ ...decoded });
            } catch (e) {
                console.error('Invalid token', e);
                logout();
            }
        }
        setLoading(false);
    }, [token]);

    const login = async (email, password) => {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Login failed');
        setToken(data.token);
        localStorage.setItem('token', data.token);
        setUser(data.user);
    };

    const signup = async (email, password, name) => {
        const response = await fetch(`${API_URL}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Signup failed');
        setToken(data.token);
        localStorage.setItem('token', data.token);
        setUser(data.user);
    };

    const googleLogin = async (credentialResponse) => {
        const response = await fetch(`${API_URL}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: credentialResponse.credential }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Google login failed');
        setToken(data.token);
        localStorage.setItem('token', data.token);
        setUser(data.user);
    };

    const microsoftLogin = async () => {
        if (!msalInstance) {
            throw new Error('Microsoft login is not configured. Add VITE_MSAL_CLIENT_ID to your .env file.');
        }
        const loginRequest = { scopes: ['User.Read'] };
        const result = await msalInstance.loginPopup(loginRequest);

        const response = await fetch(`${API_URL}/auth/microsoft`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: result.accessToken }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Microsoft login failed');
        setToken(data.token);
        localStorage.setItem('token', data.token);
        setUser(data.user);
    };

    const logout = () => {
        googleLogout();
        setToken(null);
        setUser(null);
        localStorage.removeItem('token');
    };

    return (
        <AuthContext.Provider value={{ user, token, loading, login, signup, googleLogin, microsoftLogin, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
