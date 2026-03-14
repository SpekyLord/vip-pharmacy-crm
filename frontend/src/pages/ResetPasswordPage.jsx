/**
 * ResetPasswordPage
 *
 * Allows users to set a new password using the reset token from the email link.
 * Route: /reset-password/:token
 */

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import authService from '../services/authService';
import { Moon, Sun } from 'lucide-react';

const ResetPasswordPage = () => {
  const { token } = useParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
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
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await authService.resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired reset link. Please request a new one.');
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
          <p>Set New Password</p>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#16a34a', fontSize: 24 }}>
              &#10003;
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18 }} className="auth-title">Password Reset Successful</h3>
            <p style={{ margin: '0 0 24px', fontSize: 14 }} className="auth-text">
              Your password has been updated. You can now log in with your new password.
            </p>
            <Link to="/login" className="btn btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>
              Go to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.6 }} className="auth-text">
              Enter your new password below.
            </p>

            <div className="form-group">
              <label htmlFor="password">New Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter new password"
                minLength={8}
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Confirm new password"
                minLength={8}
              />
            </div>

            {error && <p className="form-error">{error}</p>}

            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Link to="/login" style={{ fontSize: 14, textDecoration: 'none' }} className="auth-link">
                Back to Login
              </Link>
            </div>
          </form>
        )}
      </div>

      <style>{`
        .auth-title { color: #1f2937; }
        .auth-text { color: #6b7280; }
        .auth-link { color: #2563eb; }
        body.dark-mode .auth-title { color: #f1f5f9; }
        body.dark-mode .auth-text { color: #94a3b8; }
        body.dark-mode .auth-link { color: #60a5fa; }
      `}</style>
    </div>
  );
};

export default ResetPasswordPage;
