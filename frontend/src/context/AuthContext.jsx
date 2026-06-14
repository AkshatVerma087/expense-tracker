import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch, setAuthToken, getAuthToken } from '../api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On load, if token exists, we could fetch user profile here.
    // For now, if we have a token, we just assume logged in.
    const token = getAuthToken();
    if (token) {
      try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(base64));
        setUser({ id: payload.userId, authenticated: true });
      } catch (e) {
        setUser({ authenticated: true });
      }
    }
    setLoading(false);
  }, []);

  const loginWithGoogle = async (credential) => {
    try {
      const data = await apiFetch('/auth/google', {
        method: 'POST',
        body: JSON.stringify({ idToken: credential }),
      });
      setAuthToken(data.accessToken);
      setUser(data.user);
      return true;
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  };

  const loginWithEmail = async (email, password) => {
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setAuthToken(data.accessToken);
      setUser(data.user);
      return true;
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  };

  const registerWithEmail = async (name, email, password) => {
    try {
      await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      });
      return true;
    } catch (error) {
      console.error("Registration failed:", error);
      throw error;
    }
  };

  const logout = () => {
    setAuthToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, loginWithEmail, registerWithEmail, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
