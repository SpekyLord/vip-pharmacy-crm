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

    /* Fallback if image is missing */
    background:
      radial-gradient(1100px 680px at 30% 18%, rgba(250, 204, 21, 0.52) 0%, rgba(250, 204, 21, 0) 60%),
      radial-gradient(900px 560px at 78% 28%, rgba(59, 130, 246, 0.14) 0%, rgba(59, 130, 246, 0) 62%),
      radial-gradient(950px 640px at 80% 65%, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0) 62%),
      linear-gradient(135deg, #0b1020 0%, #0b1227 55%, #070b16 100%);
  }

  .login-page::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;

     /* Blurred photo background.
       Place your image at: frontend/public/login-bg.jpg
       It will be served as: /login-bg.jpg */
    background-image: url('/login-bg.jpg');
    background-size: cover;
    background-position: center;
    filter: blur(6px) saturate(1.1) brightness(0.90);
    transform: scale(1.04);
    opacity: 1;
  }

  .login-page::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;

    /* Yellow/white overlay + readability */
    background:
      radial-gradient(1000px 600px at 18% 16%, rgba(250, 204, 21, 0.26) 0%, rgba(250, 204, 21, 0) 62%),
      radial-gradient(850px 540px at 82% 28%, rgba(59, 130, 246, 0.10) 0%, rgba(59, 130, 246, 0) 62%),
      radial-gradient(920px 600px at 78% 58%, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0) 62%),
      linear-gradient(180deg, rgba(2, 6, 23, 0.24) 0%, rgba(2, 6, 23, 0.62) 100%);
  }

  .login-container {
    position: relative;
    padding: 36px 38px 30px;
    border-radius: 22px;
    width: 100%;
    max-width: 560px;
    max-height: calc(100dvh - 32px);
    overflow: hidden;

    /* Yellow/white glass card */
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.26) 0%, rgba(255, 255, 255, 0.16) 100%),
      radial-gradient(900px 340px at 10% 0%, rgba(250, 204, 21, 0.12) 0%, rgba(250, 204, 21, 0) 60%);
    border: 1px solid rgba(255, 255, 255, 0.22);
    backdrop-filter: blur(24px) saturate(145%);
    -webkit-backdrop-filter: blur(24px) saturate(145%);
    box-shadow:
      0 28px 90px rgba(0, 0, 0, 0.48),
      inset 0 1px 0 rgba(255, 255, 255, 0.10);

    color: rgba(255, 255, 255, 0.94);
  }

  .login-container::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 22px;
    pointer-events: none;
    background: radial-gradient(900px 340px at 12% 0%, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0) 60%);
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
    filter: drop-shadow(0 10px 26px rgba(0, 0, 0, 0.35));
  }

  .login-header h1 {
    margin: 0;
    font-size: 42px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: rgba(255, 255, 255, 0.96);
  }

  .login-header .login-subtitle {
    margin-top: 8px;
    font-size: 13px;
    line-height: 1.4;
    color: rgba(255, 255, 255, 0.72);
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
    color: rgba(226, 232, 240, 0.72);
  }

  .login-form input[type='email'],
  .login-form input[type='password'] {
    width: 100%;
    min-height: 48px;
    padding: 12px 18px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.38);
    background: rgba(255, 255, 255, 0.10);
    backdrop-filter: blur(14px) saturate(140%);
    -webkit-backdrop-filter: blur(14px) saturate(140%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      0 10px 28px rgba(0, 0, 0, 0.18);
    color: rgba(255, 255, 255, 0.94);
    caret-color: rgba(255, 255, 255, 0.92);
    outline: none;
    transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
  }

  /* Prevent browser autofill from forcing white/yellow backgrounds */
  .login-form input[type='email']:-webkit-autofill,
  .login-form input[type='email']:-webkit-autofill:hover,
  .login-form input[type='email']:-webkit-autofill:focus,
  .login-form input[type='password']:-webkit-autofill,
  .login-form input[type='password']:-webkit-autofill:hover,
  .login-form input[type='password']:-webkit-autofill:focus {
    -webkit-text-fill-color: rgba(255, 255, 255, 0.94) !important;
    caret-color: rgba(255, 255, 255, 0.92) !important;
    border: 1px solid rgba(255, 255, 255, 0.38) !important;

    /* Force our glass background on top of autofill */
    background-color: rgba(255, 255, 255, 0.10) !important;
    -webkit-box-shadow:
      0 0 0px 1000px rgba(255, 255, 255, 0.10) inset,
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      0 10px 28px rgba(0, 0, 0, 0.18) !important;
    box-shadow:
      0 0 0px 1000px rgba(255, 255, 255, 0.10) inset,
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      0 10px 28px rgba(0, 0, 0, 0.18) !important;

    -webkit-background-clip: padding-box;
    background-clip: padding-box;

    /* Prevent Chrome from repainting its own fill color */
    transition: background-color 9999s ease-out 0s;
  }

  .login-form input[type='email']:hover,
  .login-form input[type='password']:hover {
    border-color: rgba(255, 255, 255, 0.52);
    background: rgba(255, 255, 255, 0.12);
  }

  .login-form input::placeholder {
    color: rgba(226, 232, 240, 0.52);
  }

  .login-form input:focus {
    border-color: rgba(250, 204, 21, 0.62);
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.18);
    background: rgba(255, 255, 255, 0.14);
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
    color: rgba(226, 232, 240, 0.75);
    user-select: none;
  }

  .login-form .remember-me input {
    width: 16px;
    height: 16px;
    accent-color: #facc15;
  }

  .login-form .forgot-link {
    font-size: 13px;
    color: rgba(191, 219, 254, 0.95);
    text-decoration: none;
  }

  .login-form .forgot-link:hover {
    text-decoration: underline;
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
    background: rgba(255, 255, 255, 0.92);
    color: rgba(2, 6, 23, 0.92);
  }

  .login-form .btn-primary:hover {
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.25);
    filter: brightness(1.02);
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
