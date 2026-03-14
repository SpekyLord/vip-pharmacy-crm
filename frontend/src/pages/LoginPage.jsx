/**
 * LoginPage
 *
 * Public login page with:
 * - Login form
 * - Brand/logo display
 * - Redirect after successful login
 * - Fully responsive (mobile-first)
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LoginForm from '../components/auth/LoginForm';
import { useAuth } from '../hooks/useAuth';

const loginPageStyles = `
  html,
  body {
    height: 100%;
  }

  body {
    margin: 0;
    overflow: hidden;
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

    /* Palette (from your reference): yellow/gold/cream + white + black */
    --p-y1: 255 199 0; /* rich gold */
    --p-y2: 255 214 74; /* warm yellow */
    --p-y3: 255 226 120; /* soft yellow */
    --p-y4: 255 243 207; /* cream */
    --p-white: 255 255 255;
    --p-off: 250 248 242;
    --p-black: 11 11 11;

    /* Cream page background (reference palette) */
    background: #fffbeb;
  }

  .login-page::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;

    /* Soft orange glow (top-left) */
    background: radial-gradient(
      640px 640px at 10% 12%,
      rgba(245, 158, 11, 0.24) 0%,
      rgba(245, 158, 11, 0) 62%
    );
    filter: blur(18px);
    opacity: 1;
  }

  .login-page::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;

    background: none;
  }

  .login-container {
  position: relative;
  padding: 36px 38px 30px;
  border-radius: 22px;
  width: 100%;
  max-width: 560px;
  max-height: calc(100dvh - 32px);
  overflow: hidden;

  /* Pale orange / cream glass card (reference palette) */
  background:
    linear-gradient(
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

  color: rgba(39, 39, 42, 0.92); /* dark text for readability */
}

.login-container::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 22px;
  pointer-events: none;
  background:
    radial-gradient(
      900px 380px at 18% 0%,
      rgba(255, 255, 255, 0.70) 0%,
      rgba(255, 255, 255, 0) 62%
    );
}

.login-container > * {
  position: relative;
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

  .login-header .login-subtitle {
    margin-top: 8px;
    font-size: 13px;
    line-height: 1.4;
    color: rgba(120, 83, 50, 0.82);
    max-width: 420px;
    margin-left: auto;
    margin-right: auto;
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

  .login-form input[type='email'],
  .login-form .password-field input {
    width: 100%;
    min-height: 48px;
    padding: 12px 18px;
    border-radius: 999px;
    border: 1px solid rgba(245, 158, 11, 0.30);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.86) 0%, rgba(255, 247, 237, 0.74) 100%);
    backdrop-filter: blur(14px) saturate(140%);
    -webkit-backdrop-filter: blur(14px) saturate(140%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.28),
      0 12px 26px rgba(245, 158, 11, 0.10);
    color: rgba(39, 39, 42, 0.92);
    caret-color: rgba(39, 39, 42, 0.92);
    outline: none;
    transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
  }

  /* Prevent browser autofill from forcing white/yellow backgrounds */
  .login-form input[type='email']:-webkit-autofill,
  .login-form input[type='email']:-webkit-autofill:hover,
  .login-form input[type='email']:-webkit-autofill:focus,
  .login-form .password-field input:-webkit-autofill,
  .login-form .password-field input:-webkit-autofill:hover,
  .login-form .password-field input:-webkit-autofill:focus {
    -webkit-text-fill-color: rgba(39, 39, 42, 0.92) !important;
    caret-color: rgba(39, 39, 42, 0.92) !important;
    border: 1px solid rgba(245, 158, 11, 0.30) !important;

    /* Force our glass background on top of autofill */
    background-color: rgba(255, 255, 255, 0.86) !important;
    -webkit-box-shadow:
      0 0 0px 1000px rgba(255, 255, 255, 0.86) inset,
      inset 0 1px 0 rgba(255, 255, 255, 0.48),
      0 12px 26px rgba(245, 158, 11, 0.10) !important;
    box-shadow:
      0 0 0px 1000px rgba(255, 255, 255, 0.86) inset,
      inset 0 1px 0 rgba(255, 255, 255, 0.48),
      0 12px 26px rgba(245, 158, 11, 0.10) !important;

    -webkit-background-clip: padding-box;
    background-clip: padding-box;

    /* Prevent Chrome from repainting its own fill color */
    transition: background-color 9999s ease-out 0s;
  }

  .login-form input[type='email']:hover,
  .login-form .password-field input:hover {
    border-color: rgba(245, 158, 11, 0.42);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.90) 0%, rgba(255, 247, 237, 0.78) 100%);
  }

  .login-form input::placeholder {
    color: rgba(120, 83, 50, 0.55);
  }

  .login-form input[type='email']:focus,
  .login-form .password-field input:focus {
    border-color: rgba(245, 158, 11, 0.55);
    box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.12);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.92) 0%, rgba(255, 247, 237, 0.82) 100%);
  }

  .login-form .password-field:focus-within input {
    border-color: rgba(245, 158, 11, 0.55);
    box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.12);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.92) 0%, rgba(255, 247, 237, 0.82) 100%);
  }

  .login-form .password-field {
    position: relative;
  }

  .login-form .password-field input {
    padding-right: 54px;
  }

  .login-form .password-toggle {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    width: 38px;
    height: 38px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(245, 158, 11, 0.22);
    background: rgba(255, 255, 255, 0.62);
    color: rgba(120, 83, 50, 0.78);
    cursor: pointer;
    padding: 0;
  }

  .login-form .password-toggle:hover {
    border-color: rgba(245, 158, 11, 0.32);
    background: rgba(255, 255, 255, 0.74);
  }

  .login-form .password-toggle:focus-visible {
    outline: none;
    box-shadow: 0 0 0 4px rgb(var(--p-y2) / 0.22);
  }

  .login-form .form-options {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 10px 0 18px;
  }

  .login-form .remember-me {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: rgba(120, 83, 50, 0.86);
    user-select: none;
  }

  .login-form .remember-me input {
    width: 16px;
    height: 16px;
    accent-color: rgba(245, 158, 11, 1);
  }

  .login-form .forgot-link {
    font-size: 13px;
    color: rgba(120, 83, 50, 0.86);
    text-decoration: none;
  }

  .login-form .forgot-link:hover {
    text-decoration: underline;
    color: rgba(217, 119, 6, 0.92);
  }

  .login-form .form-error {
    margin: 10px 0 12px;
    font-size: 13px;
    color: rgba(254, 202, 202, 0.95);
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

  @media (max-width: 480px) {
    .login-container {
      padding: 30px 18px 26px;
      border-radius: 20px;
      margin: 0 4px;
    }

    .login-header .login-logo-wrap {
      width: min(280px, 86vw);
      aspect-ratio: 16 / 8;
      margin-bottom: 12px;
    }

    .login-header h1 {
      font-size: 34px;
    }
  }

  @media (max-height: 720px) {
    .login-container {
      padding: 30px 30px 26px;
    }

    .login-header {
      margin-bottom: 14px;
    }

    .login-header .login-logo-wrap {
      margin-bottom: 10px;
      width: min(260px, 82vw);
    }

    .login-header h1 {
      font-size: 34px;
    }

    .login-form .form-group {
      margin-bottom: 12px;
    }

    .login-form .btn {
      min-height: 50px;
    }
  }
`;

const LoginPage = () => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated && user) {
      // Redirect based on role
      switch (user.role) {
        case 'admin':
          navigate('/admin');
          break;
        case 'medrep':
          navigate('/medrep');
          break;
        case 'employee':
          navigate('/employee');
          break;
        default:
          navigate('/employee');
      }
    }
  }, [isAuthenticated, user, navigate]);

  return (
    <div className="login-page">
      <style>{loginPageStyles}</style>
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
          <h1>Welcome!</h1>
          <div className="login-subtitle">Sign in to continue to VIP Pharmacy CRM</div>
        </div>
        <LoginForm />
      </div>
    </div>
  );
};

export default LoginPage;
