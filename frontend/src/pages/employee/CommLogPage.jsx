/**
 * CommLogPage — BDM Communication Log Page
 *
 * Two tabs:
 *   1. Log Screenshot — Upload screenshot proof of external messaging
 *   2. Send Message — Send directly via Viber/Messenger/WhatsApp/Email (Phase 2)
 *
 * Below: list of BDM's own communication logs with filters.
 */

import { useState } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import PageGuide from '../../components/common/PageGuide';
import CommLogForm from '../../components/employee/CommLogForm';
import CommLogList from '../../components/employee/CommLogList';
import MessageComposer from '../../components/employee/MessageComposer';

const pageStyles = `
  .clp-tabs { display: flex; gap: 0; border-radius: 10px; overflow: hidden; border: 1px solid #d1d5db; margin-bottom: 16px; }
  .clp-tab { flex: 1; padding: 12px; border: none; background: #f9fafb; color: #64748b; font-size: 14px; font-weight: 600; cursor: pointer; min-height: 48px; transition: all 0.15s; }
  .clp-tab.active { background: #2563eb; color: #fff; }
  .clp-form-toggle { margin-bottom: 12px; }
  .clp-form-btn { padding: 10px 20px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; min-height: 44px; }
  .clp-form-btn:hover { background: #1d4ed8; }
  .clp-section-title { font-size: 16px; font-weight: 700; color: #1e293b; margin: 20px 0 12px; }
  body.dark-mode .clp-tab { background: #0b1220; color: #94a3b8; border-color: #334155; }
  body.dark-mode .clp-tab.active { background: #2563eb; color: #fff; }
  body.dark-mode .clp-section-title { color: #e2e8f0; }
`;

const CommLogPage = () => {
  const [activeTab, setActiveTab] = useState('screenshot'); // screenshot | send
  const [showForm, setShowForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSuccess = () => {
    setShowForm(false);
    setRefreshKey((k) => k + 1);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '20px', maxWidth: 800, margin: '0 auto', width: '100%' }}>
          <style>{pageStyles}</style>
          <PageGuide pageKey="communication-log" />

          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16, color: '#1e293b' }}>
            Communication Log
          </h1>

          {/* Tabs */}
          <div className="clp-tabs">
            <button
              className={`clp-tab${activeTab === 'screenshot' ? ' active' : ''}`}
              onClick={() => setActiveTab('screenshot')}
            >
              Log Screenshot
            </button>
            <button
              className={`clp-tab${activeTab === 'send' ? ' active' : ''}`}
              onClick={() => setActiveTab('send')}
            >
              Send Message
            </button>
          </div>

          {/* Tab content */}
          {activeTab === 'screenshot' && (
            <>
              {!showForm ? (
                <div className="clp-form-toggle">
                  <button className="clp-form-btn" onClick={() => setShowForm(true)}>
                    + Log Interaction
                  </button>
                </div>
              ) : (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>New Communication Log</span>
                    <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 18 }}>&times;</button>
                  </div>
                  <CommLogForm onSuccess={handleSuccess} />
                </div>
              )}
            </>
          )}

          {activeTab === 'send' && (
            <MessageComposer onSuccess={handleSuccess} />
          )}

          {/* Log list */}
          <div className="clp-section-title">My Interactions</div>
          <CommLogList mode="my" refreshKey={refreshKey} />
        </main>
      </div>
    </div>
  );
};

export default CommLogPage;
