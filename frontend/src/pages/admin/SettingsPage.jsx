/**
 * SettingsPage — Admin page with tabs for managing Programs and Support Types.
 */

import { useState } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import ProgramSupportManager from '../../components/admin/ProgramSupportManager';
import programService from '../../services/programService';
import supportTypeService from '../../services/supportTypeService';

const pageStyles = `
  .dashboard-layout {
    min-height: 100vh;
    background: #f3f4f6;
    --navbar-offset: 64px;
    --mobile-navbar-offset: 112px;
    --mobile-bottom-offset: 88px;
  }

  .dashboard-content {
    display: flex;
  }

  .settings-main {
    flex: 1;
    padding: calc(24px + var(--navbar-offset)) 24px 24px;
    overflow-y: auto;
    max-height: none;
  }

  .settings-header {
    margin-bottom: 24px;
  }

  .settings-header h1 {
    font-size: 24px;
    font-weight: 700;
    color: #1f2937;
    margin: 0 0 4px;
  }

  .settings-header p {
    font-size: 14px;
    color: #6b7280;
    margin: 0;
  }

  body.dark-mode .settings-header h1 { color: #f1f5f9; }
  body.dark-mode .settings-header p { color: #94a3b8; }

  .settings-tabs {
    display: flex;
    gap: 0;
    border-bottom: 2px solid #e5e7eb;
    margin-bottom: 24px;
  }

  body.dark-mode .settings-tabs { border-color: #334155; }

  .settings-tab {
    padding: 12px 24px;
    font-size: 14px;
    font-weight: 500;
    color: #6b7280;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .settings-tab:hover { color: #374151; }
  .settings-tab.active {
    color: #2563eb;
    border-bottom-color: #2563eb;
  }

  body.dark-mode .settings-tab { color: #94a3b8; }
  body.dark-mode .settings-tab:hover { color: #e2e8f0; }
  body.dark-mode .settings-tab.active { color: #60a5fa; border-bottom-color: #60a5fa; }

  body.dark-mode .dashboard-layout { background: #0f172a; }

  @media (max-width: 768px) {
    .settings-main {
      padding: var(--mobile-navbar-offset) 16px var(--mobile-bottom-offset);
      max-height: none;
    }
    .settings-header h1 { font-size: 20px; }
  }
`;

const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState('programs');

  return (
    <>
      <style>{pageStyles}</style>
      <div className="dashboard-layout">
        <Navbar />
        <div className="dashboard-content">
          <Sidebar />
          <main className="settings-main">
            <div className="settings-header">
              <h1>Programs & Support Types</h1>
              <p>Manage configurable programs and support types for VIP Client profiles</p>
            </div>

            <div className="settings-tabs">
              <button
                className={`settings-tab ${activeTab === 'programs' ? 'active' : ''}`}
                onClick={() => setActiveTab('programs')}
              >
                Programs
              </button>
              <button
                className={`settings-tab ${activeTab === 'support' ? 'active' : ''}`}
                onClick={() => setActiveTab('support')}
              >
                Support Types
              </button>
            </div>

            {activeTab === 'programs' && (
              <ProgramSupportManager service={programService} label="Program" />
            )}
            {activeTab === 'support' && (
              <ProgramSupportManager service={supportTypeService} label="Support Type" />
            )}
          </main>
        </div>
      </div>
    </>
  );
};

export default SettingsPage;
