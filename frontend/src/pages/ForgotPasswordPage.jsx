/**
 * ForgotPasswordPage
 *
 * Allows users to request a password reset email.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import authService from '../services/authService';
import { Moon, Sun } from 'lucide-react';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const [isDark, setIsDark] = useState(() => {
    try {
      const stored = localStorage.getItem('darkMode');
      if (stored === 'true' || stored === 'false') return stored === 'true';
    } catch {
      // Ignore
    }
    return document.body.classList.contains('dark-mode');
  });

  useEffect(() => {
    document.body.classList.toggle('dark-mode', isDark);
    try {
      localStorage.setItem('darkMode', String(isDark));
    } catch {
      // Ignore
    }
  }, [isDark]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await authService.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <style>{`
        @media (max-width: 480px) {
          .login-form .form-group input {
            min-height: 44px;
            font-size: 16px;
          }
          .login-form .btn {
            min-height: 44px;
            width: 100%;
          }
        }
      `}</style>
      <div className="login-container">
        <button
          type="button"
          className="auth-theme-btn"
          onClick={() => setIsDark((prev) => !prev)}
          aria-label="Toggle dark mode"
          title="Toggle dark mode"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <div className="login-header">
          <h1>VIP CRM</h1>
          <p>Password Reset</p>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#16a34a', fontSize: 24 }}>
              &#10003;
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18 }} className="auth-title">Check Your Email</h3>
            <p style={{ margin: '0 0 24px', fontSize: 14, lineHeight: 1.6 }} className="auth-text">
              If an account with <strong>{email}</strong> exists, we've sent a password reset link. Check your inbox.
            </p>
            <Link to="/login" style={{ fontSize: 14, textDecoration: 'none' }} className="auth-link">
              Back to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.6 }} className="auth-text">
              Enter your email address and we'll send you a link to reset your password.
            </p>

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Enter your email"
              />
            </div>

            {error && <p className="form-error">{error}</p>}

            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Link to="/login" style={{ fontSize: 14, textDecoration: 'none' }} className="auth-link">
                Back to Login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
