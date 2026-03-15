/**
 * ForgotPasswordPage
 *
 * Allows users to request a password reset email.
 * Matches the LoginPage gold/cream glassmorphism design.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import authService from '../services/authService';
import { Moon, Sun } from 'lucide-react';

const authStyles = `
  html,
  body {
    height: 100%;
    transition: background-color 300ms ease-in-out;
  }

  body.dark-mode {
    background-color: #0f172a;
  }

  body {
    margin: 0;
    overflow: hidden;
  }

  .theme-toggle-button {
    position: absolute;
    top: 20px;
    right: 20px;
    z-index: 100;
    background-color: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(0,0,0,0.1);
    border-radius: 50%;
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    cursor: pointer;
    color: #d97706;
    transition: all 0.2s ease-in-out;
  }

  .theme-toggle-button:hover {
    background-color: rgba(255, 255, 255, 0.7);
    transform: scale(1.1);
  }

  body.dark-mode .theme-toggle-button {
    background-color: rgba(30, 41, 59, 0.85);
    border-color: rgba(255, 255, 255, 0.1);
    color: #f59e0b;
  }

  body.dark-mode .theme-toggle-button:hover {
    background-color: rgba(51, 65, 85, 0.9);
  }

  .login-page {
    height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    padding: 16px;
    isolation: isolate;
    overflow: hidden;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji",
      "Segoe UI Emoji";
    background: #fffbeb;
  }

  body.dark-mode .login-page {
    background: #0f172a;
  }

  .login-page::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: radial-gradient(
      640px 640px at 10% 12%,
      rgba(245, 158, 11, 0.24) 0%,
      rgba(245, 158, 11, 0) 62%
    );
    filter: blur(18px);
  }

  body.dark-mode .login-page::before {
    background: radial-gradient(
      640px 640px at 10% 12%,
      rgba(245, 158, 11, 0.15) 0%,
      rgba(245, 158, 11, 0) 62%
    );
  }

  .login-container {
    position: relative;
    padding: 36px 38px 30px;
    border-radius: 22px;
    width: 100%;
    max-width: 560px;
    max-height: calc(100dvh - 32px);
    overflow: hidden;
    background: linear-gradient(
      180deg,
      rgba(255, 247, 237, 0.92) 0%,
      rgba(255, 255, 255, 0.72) 100%
    );
    border: 1px solid rgba(255, 255, 255, 0.86);
    backdrop-filter: blur(20px) saturate(120%);
    -webkit-backdrop-filter: blur(20px) saturate(120%);
    box-shadow:
      0 22px 60px rgba(245, 158, 11, 0.10),
      inset 0 1px 0 rgba(255, 255, 255, 0.82);
    color: rgba(39, 39, 42, 0.92);
  }

  .login-container::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 22px;
    pointer-events: none;
    background: radial-gradient(
      900px 380px at 18% 0%,
      rgba(255, 255, 255, 0.70) 0%,
      rgba(255, 255, 255, 0) 62%
    );
  }

  .login-container > * {
    position: relative;
  }

  body.dark-mode .login-container {
    background: linear-gradient(
      180deg,
      rgba(30, 41, 59, 0.85) 0%,
      rgba(51, 65, 85, 0.75) 100%
    );
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow: 0 22px 60px rgba(0, 0, 0, 0.25),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
    color: rgba(248, 250, 252, 0.92);
  }

  body.dark-mode .login-container::before {
    background: radial-gradient(
      900px 380px at 18% 0%,
      rgba(255, 255, 255, 0.1) 0%,
      rgba(255, 255, 255, 0) 62%
    );
  }

  .login-header {
    text-align: center;
    margin-bottom: 22px;
  }

  .login-header .login-logo-wrap {
    width: min(300px, 82vw);
    aspect-ratio: 16 / 8;
    margin: 0 auto 12px;
    overflow: hidden;
  }

  .login-header .login-logo {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    filter: drop-shadow(0 10px 26px rgba(245, 158, 11, 0.16));
  }

  .login-header h1 {
    margin: 0;
    font-size: 42px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #d97706;
  }

  body.dark-mode .login-header h1 {
    color: #f59e0b;
  }

  .login-header .login-subtitle {
    margin-top: 8px;
    font-size: 13px;
    line-height: 1.4;
    color: rgba(120, 83, 50, 0.82);
  }

  body.dark-mode .login-header .login-subtitle {
    color: rgba(148, 163, 184, 0.82);
  }

  .login-form {
    margin-top: 6px;
  }

  .login-form .form-group {
    margin-bottom: 16px;
  }

  .login-form label {
    display: block;
    margin-bottom: 8px;
    font-size: 13px;
    color: rgba(39, 39, 42, 0.86);
  }

  body.dark-mode .login-form label {
    color: rgba(226, 232, 240, 0.86);
  }

  .login-form input[type='email'],
  .login-form input[type='password'] {
    width: 100%;
    min-height: 48px;
    padding: 12px 18px;
    border-radius: 999px;
    border: 1px solid rgba(245, 158, 11, 0.30);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.86) 0%, rgba(255, 247, 237, 0.74) 100%);
    backdrop-filter: blur(14px) saturate(140%);
    -webkit-backdrop-filter: blur(14px) saturate(140%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.28),
      0 12px 26px rgba(245, 158, 11, 0.10);
    color: rgba(39, 39, 42, 0.92);
    outline: none;
    transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
    box-sizing: border-box;
    font-size: 14px;
  }

  .login-form input::placeholder {
    color: rgba(120, 83, 50, 0.55);
  }

  .login-form input[type='email']:hover,
  .login-form input[type='password']:hover {
    border-color: rgba(245, 158, 11, 0.42);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.90) 0%, rgba(255, 247, 237, 0.78) 100%);
  }

  .login-form input[type='email']:focus,
  .login-form input[type='password']:focus {
    border-color: rgba(245, 158, 11, 0.55);
    box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.12);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.92) 0%, rgba(255, 247, 237, 0.82) 100%);
  }

  body.dark-mode .login-form input[type='email'],
  body.dark-mode .login-form input[type='password'] {
    border-color: rgba(245, 158, 11, 0.4);
    background: linear-gradient(
      180deg,
      rgba(51, 65, 85, 0.8) 0%,
      rgba(30, 41, 59, 0.7) 100%
    );
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05),
      0 12px 26px rgba(0, 0, 0, 0.2);
    color: rgba(248, 250, 252, 0.92);
  }

  body.dark-mode .login-form input::placeholder {
    color: rgba(148, 163, 184, 0.55);
  }

  body.dark-mode .login-form input[type='email']:hover,
  body.dark-mode .login-form input[type='password']:hover {
    border-color: rgba(245, 158, 11, 0.55);
  }

  body.dark-mode .login-form input[type='email']:focus,
  body.dark-mode .login-form input[type='password']:focus {
    border-color: rgba(245, 158, 11, 0.7);
  }

  .login-form .form-error {
    margin: 10px 0 12px;
    font-size: 13px;
    color: #dc2626;
  }

  body.dark-mode .login-form .form-error {
    color: #fca5a5;
  }

  .login-form .btn {
    width: 100%;
    min-height: 54px;
    font-size: 15px;
    font-weight: 650;
    border-radius: 999px;
    cursor: pointer;
    border: none;
    transition: transform 120ms ease, box-shadow 160ms ease, filter 160ms ease;
  }

  .login-form .btn-primary {
    background: #f59e0b;
    color: rgba(255, 255, 255, 0.98);
  }

  .login-form .btn-primary:hover {
    box-shadow: 0 18px 44px rgba(245, 158, 11, 0.28);
    filter: brightness(1.02);
    background: #d97706;
  }

  .login-form .btn-primary:active {
    transform: scale(0.98);
  }

  .login-form .btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  body.dark-mode .login-form .btn-primary {
    background: #f59e0b;
    color: rgba(11, 11, 11, 0.95);
  }

  body.dark-mode .login-form .btn-primary:hover {
    filter: brightness(1.05);
    background: #fbbf24;
  }

  .auth-text {
    color: rgba(120, 83, 50, 0.82);
  }

  .auth-title {
    color: #1f2937;
  }

  .auth-link {
    color: #d97706;
    text-decoration: none;
  }

  .auth-link:hover {
    text-decoration: underline;
    color: #b45309;
  }

  body.dark-mode .auth-title {
    color: #f1f5f9;
  }

  body.dark-mode .auth-text {
    color: rgba(148, 163, 184, 0.82);
  }

  body.dark-mode .auth-link {
    color: #f59e0b;
  }

  body.dark-mode .auth-link:hover {
    color: #fbbf24;
  }

  .auth-success-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: rgba(245, 158, 11, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
    color: #d97706;
    font-size: 24px;
  }

  body.dark-mode .auth-success-icon {
    background: rgba(245, 158, 11, 0.2);
    color: #f59e0b;
  }

  @media (max-width: 480px) {
    .login-container {
      padding: 30px 18px 26px;
      border-radius: 20px;
      margin: 0 4px;
    }

    .login-header .login-logo-wrap {
      width: min(280px, 86vw);
      margin-bottom: 12px;
    }

    .login-header h1 {
      font-size: 34px;
    }

    .login-form .form-group input {
      min-height: 44px;
      font-size: 16px;
    }

    .login-form .btn {
      min-height: 44px;
      width: 100%;
    }
  }
`;

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const [isDark, setIsDark] = useState(() => {
    try {
      const stored = localStorage.getItem('darkMode');
      if (stored === 'true' || stored === 'false') return stored === 'true';
      const theme = localStorage.getItem('theme');
      if (theme) return theme === 'dark';
    } catch {
      // Ignore
    }
    return document.body.classList.contains('dark-mode');
  });

  useEffect(() => {
    document.body.classList.toggle('dark-mode', isDark);
    try {
      localStorage.setItem('darkMode', String(isDark));
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
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
      <style>{authStyles}</style>
      <button
        type="button"
        className="theme-toggle-button"
        onClick={() => setIsDark((prev) => !prev)}
        aria-label="Toggle dark mode"
      >
        {isDark ? <Sun size={20} /> : <Moon size={20} />}
      </button>
      <div className="login-container">
        <div className="login-header">
          <div className="login-logo-wrap">
            <img
              src="/cip-logo.svg"
              onError={(e) => {
                e.currentTarget.src = '/VIP_LOGO-removebg.svg';
              }}
              alt="CIP"
              className="login-logo"
            />
          </div>
          <h1>Password Reset</h1>
          <div className="login-subtitle">Enter your email to receive a reset link</div>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div className="auth-success-icon">&#10003;</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18 }} className="auth-title">Check Your Email</h3>
            <p style={{ margin: '0 0 24px', fontSize: 14, lineHeight: 1.6 }} className="auth-text">
              If an account with <strong>{email}</strong> exists, we've sent a password reset link. Check your inbox.
            </p>
            <Link to="/login" className="auth-link">
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
              <Link to="/login" className="auth-link">
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
