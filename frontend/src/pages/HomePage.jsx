/**
 * HomePage — BOSS-style landing page after login
 * Shows entity/warehouse selector, then CRM or ERP entry
 * Matches BOSS "Applications" screen design
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';

const ADMIN_LIKE = ['admin', 'president', 'ceo', 'finance'];

const styles = `
  .home-page {
    min-height: 100vh;
    min-height: 100dvh;
    background: #fffbeb;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    position: relative;
    overflow: hidden;
    isolation: isolate;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji",
      "Segoe UI Emoji";
  }

  .home-page::before {
    content: '';
    position: relative;
    position: absolute;
    inset: 0;
    z-index: -1;
    background: radial-gradient(
      640px 640px at 10% 12%,
      rgba(245, 158, 11, 0.22) 0%,
      rgba(245, 158, 11, 0) 62%
    );
    filter: blur(18px);
  }

  .home-shell {
    width: 100%;
    max-width: 620px;
    max-height: calc(100dvh - 32px);
    overflow: auto;
    border-radius: 22px;
    padding: 28px 24px 22px;
    background: linear-gradient(
      180deg,
      rgba(255, 247, 237, 0.92) 0%,
      rgba(255, 255, 255, 0.72) 100%
    );
    border: 1px solid rgba(255, 255, 255, 0.86);
    backdrop-filter: blur(20px) saturate(120%);
    -webkit-backdrop-filter: blur(20px) saturate(120%);
    box-shadow: 0 22px 60px rgba(245, 158, 11, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.82);
  }

  .home-header {
    text-align: center;
    margin-bottom: 18px;
  }

  .home-logo {
    height: 124px;
    margin-bottom: 8px;
    object-fit: contain;
  }

  .home-greeting {
    color: rgba(120, 83, 50, 0.82);
    font-size: 13px;
    margin: 0;
  }

  .home-name {
    color: #d97706;
    font-size: 34px;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin: 2px 0 0;
  }

  .home-role {
    display: inline-block;
    margin-top: 8px;
    padding: 5px 12px;
    background: rgba(255, 255, 255, 0.78);
    border: 1px solid rgba(245, 158, 11, 0.28);
    border-radius: 999px;
    color: rgba(120, 83, 50, 0.9);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .home-body {
    padding: 0;
  }

  .platform-section {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 12px;
  }

  .platform-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px 14px;
    border-radius: 18px;
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 0.2s ease;
    text-decoration: none;
    box-shadow: 0 14px 28px rgba(15, 23, 42, 0.07);
  }

  .platform-card-crm {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.94) 0%, rgba(254, 240, 138, 0.45) 100%);
    border-color: rgba(245, 158, 11, 0.34);
  }

  .platform-card-crm:hover {
    transform: translateY(-2px);
    border-color: rgba(245, 158, 11, 0.55);
    box-shadow: 0 18px 36px rgba(245, 158, 11, 0.2);
  }

  .platform-card-erp {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.94) 0%, rgba(254, 215, 170, 0.48) 100%);
    border-color: rgba(217, 119, 6, 0.34);
  }

  .platform-card-erp:hover {
    transform: translateY(-2px);
    border-color: rgba(217, 119, 6, 0.55);
    box-shadow: 0 18px 36px rgba(217, 119, 6, 0.22);
  }

  .platform-icon {
    font-size: 30px;
    margin-bottom: 8px;
  }

  .platform-label {
    font-size: 20px;
    font-weight: 700;
    color: #7c2d12;
  }

  .platform-desc {
    font-size: 12px;
    color: rgba(120, 83, 50, 0.86);
    margin-top: 4px;
    text-align: center;
  }

  .home-meta {
    margin-top: 12px;
    text-align: center;
    font-size: 12px;
    color: rgba(120, 83, 50, 0.74);
  }

  .home-meta strong {
    color: rgba(120, 83, 50, 0.9);
  }

  .home-logout {
    padding: 16px 0 0;
    text-align: center;
  }

  .home-logout button {
    width: 100%;
    min-height: 48px;
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.8);
    color: #7c2d12;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .home-logout button:hover {
    box-shadow: 0 14px 28px rgba(245, 158, 11, 0.18);
    background: rgba(255, 255, 255, 0.95);
  }

  .home-loading {
    text-align: center;
    margin-top: 12px;
    color: rgba(120, 83, 50, 0.75);
    font-size: 13px;
  }

  @media (max-width: 480px) {
    .home-shell {
      padding: 22px 14px 16px;
      border-radius: 20px;
    }

    .home-logo {
      height: 102px;
    }

    .home-name {
      font-size: 30px;
    }

    .platform-section {
      grid-template-columns: 1fr;
      gap: 8px;
    }
  }
`;

export default function HomePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);

  const isAdminLike = ADMIN_LIKE.includes(user?.role);
  const crmPath = isAdminLike ? '/admin' : '/bdm';
  const hasErp = user?.erp_access?.enabled;

  // ── Auto-route logic (20.6) ──
  // Always show the CRM/ERP chooser landing page.
  // Only auto-route BDMs (employees) who don't have ERP access — they only use CRM.
  useEffect(() => {
    if (!user) return;

    // BDMs without ERP → go straight to CRM (phone-first daily work)
    if (user.role === 'employee' && !hasErp) {
      navigate('/bdm');
      return;
    }

    // Everyone else (president, admin, finance, BDMs with ERP) → show chooser
  }, [user]);

  useEffect(() => {
    if (!hasErp) {
      setLoading(false);
      return;
    }
    api.get('/erp/warehouse/my')
      .then(res => {
        const data = res.data?.data || res.data || [];
        setWarehouses(Array.isArray(data) ? data : []);
      })
      .catch(() => setWarehouses([]))
      .finally(() => setLoading(false));
  }, [hasErp]);

  // Save preference + navigate
  const goTo = (platform, path) => {
    localStorage.setItem('vip_last_platform', platform);
    navigate(path);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const roleLabel = {
    president: 'President',
    admin: 'Administrator',
    finance: 'Finance',
    ceo: 'CEO',
    employee: 'BDM',
    medrep: 'MedRep'
  };

  return (
    <div className="home-page">
      <style>{styles}</style>

      <div className="home-shell">

        <div className="home-header">
          <img src="/cip-logo.svg" alt="VIP" className="home-logo" onError={(e) => { e.currentTarget.src = '/VIP_LOGO_R.png'; }} />
          <p className="home-greeting">Welcome back,</p>
          <h1 className="home-name">{user?.name || 'User'}</h1>
          <span className="home-role">{roleLabel[user?.role] || user?.role}</span>
        </div>

        <div className="home-body">
          <div className="platform-section">
            <div className="platform-card platform-card-crm" onClick={() => goTo('crm', crmPath)}>
              <div className="platform-icon">📋</div>
              <div className="platform-label">CRM</div>
              <div className="platform-desc">Visits & Clients</div>
            </div>

            {hasErp ? (
              <div className="platform-card platform-card-erp" onClick={() => goTo('erp', '/erp')}>
                <div className="platform-icon">📊</div>
                <div className="platform-label">ERP</div>
                <div className="platform-desc">Sales & Accounting</div>
              </div>
            ) : (
              <div className="platform-card platform-card-erp" style={{ opacity: 0.45, cursor: 'not-allowed' }}>
                <div className="platform-icon">🔒</div>
                <div className="platform-label">ERP</div>
                <div className="platform-desc">Not enabled</div>
              </div>
            )}
          </div>

          {hasErp && (
            <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(120, 83, 50, 0.74)', marginTop: 10 }}>
              <button
                onClick={() => { localStorage.removeItem('vip_last_platform'); }}
                style={{ background: 'none', border: 'none', color: 'rgba(120, 83, 50, 0.74)', cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}
              >
                Always show this chooser
              </button>
            </div>
          )}

          {hasErp && (
            <div className="home-meta">
              Assigned warehouses: <strong>{warehouses.length}</strong>
            </div>
          )}

          {loading && hasErp && <div className="home-loading">Loading ERP access...</div>}

          <div className="home-logout">
            <button onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </div>

    </div>
  );
}
