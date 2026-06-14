import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const { loginWithGoogle, loginWithEmail, registerWithEmail } = useAuth();
  const navigate = useNavigate();
  const [isRegistering, setIsRegistering] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);

  const handleSuccess = async (credentialResponse) => {
    try {
      await loginWithGoogle(credentialResponse.credential);
      navigate('/');
    } catch (err) {
      setError("Google Login failed. Please try again.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      if (isRegistering) {
        await registerWithEmail(formData.name, formData.email, formData.password);
        alert('Registration successful! Please sign in.');
        setIsRegistering(false);
      } else {
        await loginWithEmail(formData.email, formData.password);
        navigate('/');
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">SE</div>
        <h1 style={{ marginBottom: '8px', fontSize: '24px' }}>Welcome to SplitEase</h1>
        <p style={{ color: 'var(--text2)', marginBottom: '32px' }}>
          {isRegistering ? 'Create your account' : 'Sign in to your account'}
        </p>

        {error && <div className="alert" style={{ marginBottom: '16px' }}><div className="alert-title">{error}</div></div>}

        <form onSubmit={handleSubmit} style={{ textAlign: 'left', marginBottom: '24px' }}>
          {isRegistering && (
            <div className="form-group">
              <label>Name</label>
              <input 
                type="text" 
                required 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
          )}
          <div className="form-group">
            <label>Email</label>
            <input 
              type="email" 
              required 
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input 
              type="password" 
              required 
              value={formData.password}
              onChange={e => setFormData({...formData, password: e.target.value})}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '10px' }}>
            {isRegistering ? 'Register' : 'Sign In'}
          </button>
        </form>

        <div style={{ margin: '20px 0', position: 'relative', textAlign: 'center' }}>
          <hr style={{ borderColor: 'var(--border2)' }}/>
          <span style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', background: 'var(--bg2)', padding: '0 10px', color: 'var(--text3)', fontSize: '12px' }}>OR</span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={() => setError('Google Login Failed')}
            useOneTap
            shape="rectangular"
            theme="outline"
            size="large"
          />
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text2)' }}>
          {isRegistering ? 'Already have an account? ' : "Don't have an account? "}
          <a 
            href="#" 
            onClick={(e) => { e.preventDefault(); setIsRegistering(!isRegistering); setError(null); }}
            style={{ color: 'var(--green)', fontWeight: '600' }}
          >
            {isRegistering ? 'Sign In' : 'Sign Up'}
          </a>
        </p>
      </div>
    </div>
  );
}
