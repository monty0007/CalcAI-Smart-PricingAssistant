import { createContext, useContext, useState, useEffect } from 'react';
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
    updateProfile,
} from 'firebase/auth';
import { auth } from '../firebase';

const AuthContext = createContext();
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * After any Firebase sign-in, upsert the user in our PostgreSQL DB
 * and get back their stored preferences (region, currency).
 */
async function syncUserWithBackend(firebaseUser) {
    const idToken = await firebaseUser.getIdToken(/* forceRefresh */ false);
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${API_URL}/auth/firebase`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
                name: firebaseUser.displayName || firebaseUser.email,
                email: firebaseUser.email,
            }),
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.ok) return await res.json(); // returns { user: { ... } }
    } catch (err) {
        console.warn('Backend sync failed (will retry on next sign-in):', err.name === 'AbortError' ? 'Request timed out' : err);
    }
    return null;
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);   // merged: firebase + DB prefs
    const [token, setToken] = useState(null); // Firebase ID token (used as Bearer)
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                const idToken = await firebaseUser.getIdToken();
                setToken(idToken);

                // Set user immediately from Firebase data so the app can render
                setUser({
                    id: firebaseUser.uid,
                    uid: firebaseUser.uid,
                    email: firebaseUser.email,
                    name: firebaseUser.displayName || firebaseUser.email,
                });
                setLoading(false);

                // Sync with backend in the background (non-blocking)
                syncUserWithBackend(firebaseUser).then(dbData => {
                    if (dbData?.user) {
                        setUser(prev => ({ ...prev, ...dbData.user }));
                    }
                });
            } else {
                setUser(null);
                setToken(null);
                setLoading(false);
            }
        });
        return unsubscribe;
    }, []);

    // Auto-refresh token before it expires (Firebase tokens last 1 hour)
    useEffect(() => {
        if (!auth.currentUser) return;
        const interval = setInterval(async () => {
            const freshToken = await auth.currentUser?.getIdToken(true);
            if (freshToken) setToken(freshToken);
        }, 50 * 60 * 1000); // refresh every 50 minutes
        return () => clearInterval(interval);
    }, [user]);

    const login = async (email, password) => {
        const result = await signInWithEmailAndPassword(auth, email, password);
        const idToken = await result.user.getIdToken();
        setToken(idToken);
    };

    const signup = async (email, password, name) => {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        if (name) await updateProfile(result.user, { displayName: name });
        const idToken = await result.user.getIdToken();
        setToken(idToken);
    };

    const googleLogin = async () => {
        const result = await signInWithPopup(auth, googleProvider);
        const idToken = await result.user.getIdToken();
        setToken(idToken);
    };

    const logout = async () => {
        setUser(null);
        setToken(null);
        await signOut(auth);
    };

    // Re-syncs the current user with the backend to pick up tier changes
    const refreshUser = async () => {
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) return;
        const dbData = await syncUserWithBackend(firebaseUser);
        if (dbData?.user) {
            setUser(prev => ({ ...prev, ...(dbData.user || {}) }));
        }
    };

    return (
        <AuthContext.Provider value={{ user, token, loading, login, signup, googleLogin, logout, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
