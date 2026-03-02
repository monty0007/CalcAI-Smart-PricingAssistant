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

/**
 * After any Firebase sign-in, upsert the user in our PostgreSQL DB
 * and get back their stored preferences (region, currency).
 */
async function syncUserWithBackend(firebaseUser) {
    const idToken = await firebaseUser.getIdToken(/* forceRefresh */ false);
    try {
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
        });
        if (res.ok) return await res.json(); // returns { user: { ... } }
    } catch (err) {
        console.warn('Backend sync failed (will retry on next sign-in):', err);
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

                const dbData = await syncUserWithBackend(firebaseUser);
                setUser({
                    id: firebaseUser.uid,
                    uid: firebaseUser.uid,
                    email: firebaseUser.email,
                    name: firebaseUser.displayName || firebaseUser.email,
                    // Merge any stored preferences from our DB
                    ...(dbData?.user || {}),
                });
            } else {
                setUser(null);
                setToken(null);
            }
            setLoading(false);
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

    const logout = () => signOut(auth);

    return (
        <AuthContext.Provider value={{ user, token, loading, login, signup, googleLogin, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
