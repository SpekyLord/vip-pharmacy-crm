/**
 * LoginForm Component
 *
 * Login form with:
 * - Email and password fields
 * - Form validation
 * - Error display
 * - Loading state
 */

import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const LoginForm = () => {
  const { login, loading, error } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const passwordInputRef = useRef(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  });

  const handleTogglePassword = () => {
    setShowPassword((value) => !value);
    requestAnimationFrame(() => {
      passwordInputRef.current?.focus({ preventScroll: true });
    });
  };

  const handleChange = (e) => {
    const { name, type, checked, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(formData.email, formData.password);
    } catch {
      // Error is already set in AuthContext, no additional handling needed
    }
  };

  return (
    <form onSubmit={handleSubmit} className="login-form">
      <div className="form-group">
        <label htmlFor="email">Email</label>
        <input
          type="email"
          id="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          required
          placeholder="Enter your email"
        />
      </div>

      <div className="form-group">
        <label htmlFor="password">Password</label>
        <div className="password-field">
          <input
            type={showPassword ? 'text' : 'password'}
            id="password"
            name="password"
            ref={passwordInputRef}
            value={formData.password}
            onChange={handleChange}
            required
            placeholder="Enter your password"
            autoComplete="current-password"
          />
          <button
            type="button"
            className="password-toggle"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={(e) => e.preventDefault()}
            onClick={handleTogglePassword}
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M3 3l18 18"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M10.6 10.6a2.5 2.5 0 0 0 2.8 2.8"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6 0 9.5 7 9.5 7a17.2 17.2 0 0 1-3.3 4.3"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M6.2 6.2C3.9 7.8 2.5 12 2.5 12S6 19 12 19c1 0 2-.2 2.9-.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="form-options">
        <label className="remember-me">
          <input
            type="checkbox"
            name="rememberMe"
            checked={formData.rememberMe}
            onChange={handleChange}
          />
          <span>Remember me</span>
        </label>

        <Link to="/forgot-password" className="forgot-link">
          Forgot password?
        </Link>
      </div>

      <button type="submit" disabled={loading} className="btn btn-primary">
        {loading ? 'Logging in...' : 'Log In'}
      </button>
    </form>
  );
};

export default LoginForm;
