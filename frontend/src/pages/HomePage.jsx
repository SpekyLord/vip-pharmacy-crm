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
    background: #f8f9fb;
    display: flex;
    flex-direction: column;
  }

  .home-header {
    background: #ffffff;
    padding: 24px 20px 32px;
    text-align: center;
    position: relative;
  }

  .home-logo {
    height: 200px;
    margin-bottom: 12px;
  }

  .home-greeting {
    color: #64748b;
    font-size: 14px;
    margin: 0;
  }

  .home-name {
    color: #0f172a;
    font-size: 20px;
    font-weight: 700;
    margin: 4px 0 0;
  }

  .home-role {
    display: inline-block;
    margin-top: 8px;
    padding: 3px 12px;
    background: #f1f5f9;
    border-radius: 20px;
    color: #475569;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .home-body {
    flex: 1;
    padding: 0;
  }

  /* Platform selector */
  .platform-section {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    padding: 20px;
  }

  .platform-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    border-radius: 16px;
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
  }

  .platform-card-crm {
    background: linear-gradient(135deg, #eff6ff, #dbeafe);
    border-color: #93c5fd;
  }

  .platform-card-crm:active {
    transform: scale(0.97);
    border-color: #3b82f6;
  }

  .platform-card-erp {
    background: linear-gradient(135deg, #f0fdf4, #dcfce7);
    border-color: #86efac;
  }

  .platform-card-erp:active {
    transform: scale(0.97);
    border-color: #22c55e;
  }

  .platform-icon {
    font-size: 32px;
    margin-bottom: 8px;
  }

  .platform-label {
    font-size: 18px;
    font-weight: 700;
    color: #0f172a;
  }

  .platform-desc {
    font-size: 12px;
    color: #64748b;
    margin-top: 4px;
    text-align: center;
  }

  /* Entity list */
  .section-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #94a3b8;
    padding: 16px 20px 8px;
  }

  .entity-list {
    background: #fff;
    border-top: 1px solid #e5e7eb;
    border-bottom: 1px solid #e5e7eb;
  }

  .entity-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid #f1f5f9;
    cursor: pointer;
    transition: background 0.15s;
  }

  .entity-item:last-child {
    border-bottom: none;
  }

  .entity-item:active {
    background: #f1f5f9;
  }

  .entity-name {
    font-size: 15px;
    font-weight: 500;
    color: #1e293b;
  }

  .entity-code {
    font-size: 12px;
    color: #94a3b8;
    margin-top: 2px;
  }

  .entity-chevron {
    color: #cbd5e1;
    font-size: 18px;
  }

  .entity-active {
    background: #f0f9ff;
  }

  .entity-active .entity-name {
    color: #2563eb;
    font-weight: 600;
  }

  /* Logout */
  .home-logout {
    padding: 20px;
    text-align: center;
  }

  .home-logout button {
    padding: 10px 32px;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    background: #fff;
    color: #64748b;
    font-size: 14px;
    cursor: pointer;
  }

  .home-loading {
    text-align: center;
    padding: 40px;
    color: #94a3b8;
    font-size: 14px;
  }

  @media (min-width: 600px) {
    .home-body {
      max-width: 480px;
      margin: 0 auto;
      width: 100%;
    }
  }
`;

export default function HomePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoRouteBlocked, setAutoRouteBlocked] = useState(false);

  const isAdminLike = ADMIN_LIKE.includes(user?.role);
  const crmPath = isAdminLike ? '/admin' : '/bdm';
  const hasErp = user?.erp_access?.enabled;

  // ── Auto-route logic (20.6) ──
  // BDM → CRM dashboard (phone-first daily work)
  // Admin/President with ERP → ERP
  // Only CRM users → CRM
  // Last preference as fallback
  useEffect(() => {
    if (!user || autoRouteBlocked) return;

    const lastPref = localStorage.getItem('vip_last_platform');

    // BDMs always go to CRM (their daily tool is the phone CRM)
    if (user.role === 'employee') {
      navigate('/bdm');
      return;
    }

    // If user has a saved preference, use it
    if (lastPref === 'erp' && hasErp) {
      navigate('/erp');
      return;
    }
    if (lastPref === 'crm') {
      navigate(crmPath);
      return;
    }

    // Admin/President/Finance with ERP → ERP by default
    if (isAdminLike && hasErp) {
      navigate('/erp');
      return;
    }

    // Only CRM → CRM
    if (!hasErp) {
      navigate(crmPath);
      return;
    }

    // Fallback: show chooser (don't auto-route)
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

      <div className="home-header">
        <img src="/VIP_LOGO_R.png" alt="VIP" className="home-logo" />
        <p className="home-greeting">Welcome back,</p>
        <h1 className="home-name">{user?.name || 'User'}</h1>
        <span className="home-role">{roleLabel[user?.role] || user?.role}</span>
      </div>

      <div className="home-body">
        {/* CRM / ERP Platform Selection */}
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
            <div className="platform-card platform-card-erp" style={{ opacity: 0.4, cursor: 'not-allowed' }}>
              <div className="platform-icon">🔒</div>
              <div className="platform-label">ERP</div>
              <div className="platform-desc">Not enabled</div>
            </div>
          )}
        </div>

        {hasErp && (
          <div style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', marginTop: -4, marginBottom: 8 }}>
            <button
              onClick={() => { setAutoRouteBlocked(true); localStorage.removeItem('vip_last_platform'); }}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}
            >
              Always show this chooser
            </button>
          </div>
        )}

        <div className="home-logout">
          <button onClick={handleLogout}>Logout</button>
        </div>
      </div>
    </div>
  );
}
