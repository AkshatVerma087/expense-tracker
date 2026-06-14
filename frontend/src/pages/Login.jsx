import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('aisha@flatmates.in');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const success = await login(email, password);
    if (success) {
      navigate('/');
    } else {
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

        <div className="divider"></div>
        <div className="text-sm text-muted" style={{ textAlign: 'center' }}>
          Don't have an account? <span style={{ color: 'var(--indigo)', fontWeight: 500, cursor: 'pointer' }}>Create one →</span>
        </div>
      </div>
    </div>
  );
}
