/**
 * CommLogsPage — Admin Communication Logs Overview
 *
 * All BDM communication interactions across channels.
 * Filters: BDM, channel, date range.
 */

import { useState, useEffect } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import PageGuide from '../../components/common/PageGuide';
import CommLogList from '../../components/employee/CommLogList';
import userService from '../../services/userService';

const pageStyles = `
  .aclp-filters { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; align-items: center; }
  .aclp-select { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; min-height: 40px; background: #fff; min-width: 180px; }
  body.dark-mode .aclp-select { background: #0b1220; border-color: #334155; color: #e2e8f0; }
`;

const CommLogsPage = () => {
  const [bdms, setBdms] = useState([]);
  const [selectedBdm, setSelectedBdm] = useState('');

  // Fetch BDMs for filter dropdown
  useEffect(() => {
    const fetchBdms = async () => {
      try {
        const result = await userService.getAll({ role: 'contractor', limit: 100 });
        setBdms(result.data || []);
      } catch {
        // Ignore
      }
    };
    fetchBdms();
  }, []);

  const adminFilters = {};
  if (selectedBdm) adminFilters.userId = selectedBdm;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '20px', maxWidth: 1000, margin: '0 auto', width: '100%' }}>
          <style>{pageStyles}</style>
          <PageGuide pageKey="admin-communication-logs" />

          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16, color: '#1e293b' }}>
            Communication Logs
          </h1>

          {/* BDM filter */}
          <div className="aclp-filters">
            <select
              className="aclp-select"
              value={selectedBdm}
              onChange={(e) => setSelectedBdm(e.target.value)}
            >
              <option value="">All BDMs</option>
              {bdms.map((bdm) => (
                <option key={bdm._id} value={bdm._id}>{bdm.name || bdm.email}</option>
              ))}
            </select>
          </div>

          {/* All logs */}
          <CommLogList mode="admin" adminFilters={adminFilters} />
        </main>
      </div>
    </div>
  );
};

export default CommLogsPage;
