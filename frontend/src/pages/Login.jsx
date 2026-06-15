import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';

export default function Login() {
  const [email, setEmail] = useState('aisha@flatmates.in');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const { loginWithEmail, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const success = await loginWithEmail(email, password);
      if (success) {
        navigate('/');
      }
    } catch (err) {
      setError('Invalid credentials');
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo-big">S</div>
        <div style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px' }}>Welcome back</div>
        <div className="text-muted text-sm" style={{ marginBottom: '24px' }}>Sign in to your SplitEase account</div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: '16px' }}>
            <span>⚠</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="input-group">
            <label className="input-label">Email address</label>
            <input 
              className="input" 
              type="email" 
              placeholder="aisha@example.com" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <label className="input-label">Password</label>
            <input 
              className="input" 
              type="password" 
              placeholder="••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary full-width" style={{ justifyContent: 'center', padding: '10px' }}>
            Sign in
          </button>
        </form>

        <div style={{ margin: '16px 0', textAlign: 'center', color: 'var(--slate-500)', fontSize: '14px' }}>— or —</div>
        
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <GoogleLogin
            onSuccess={async (credentialResponse) => {
              setError('');
              try {
                const success = await loginWithGoogle(credentialResponse.credential);
                if (success) navigate('/');
              } catch (err) {
                setError('Google login failed');
              }
            }}
            onError={() => {
              setError('Google Login was unsuccessful');
            }}
            useOneTap
          />
        </div>

        <div className="divider" style={{ marginTop: '0' }}></div>
        <div className="text-sm text-muted" style={{ textAlign: 'center' }}>
          Don't have an account? <span style={{ color: 'var(--indigo)', fontWeight: 500, cursor: 'pointer' }}>Create one →</span>
        </div>
      </div>
    </div>
  );
}
