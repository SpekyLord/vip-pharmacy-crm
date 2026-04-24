/**
 * CommLogsPage — Admin Communication Logs Overview
 *
 * Tabs:
 *   1. Unmatched Messages — inbound messages with no linked VIP Client (AI suggestions)
 *   2. All Logs — full BDM communication log history
 */

import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import PageGuide from '../../components/common/PageGuide';
import CommLogList from '../../components/employee/CommLogList';
import userService from '../../services/userService';
import doctorService from '../../services/doctorService';
import communicationLogService from '../../services/communicationLogService';

const CONFIDENCE_COLOR = { high: '#16a34a', medium: '#d97706', low: '#dc2626' };
const CONFIDENCE_BG = { high: '#dcfce7', medium: '#fef3c7', low: '#fee2e2' };

const pageStyles = `
  .aclp-tabs { display: flex; gap: 0; border-bottom: 2px solid #e5e7eb; margin-bottom: 20px; }
  .aclp-tab { padding: 10px 20px; background: none; border: none; font-size: 14px; font-weight: 600; color: #6b7280; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; }
  .aclp-tab.active { color: #1d4ed8; border-bottom-color: #1d4ed8; }
  .aclp-filters { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; align-items: center; }
  .aclp-select { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; min-height: 40px; background: #fff; min-width: 180px; }
  body.dark-mode .aclp-select { background: #0b1220; border-color: #334155; color: #e2e8f0; }

  .unmatched-empty { text-align: center; padding: 40px 20px; color: #6b7280; font-size: 14px; }
  .unmatched-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
  body.dark-mode .unmatched-card { background: #0f172a; border-color: #1e293b; }
  .unmatched-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
  .unmatched-sender { font-weight: 700; font-size: 15px; color: #111827; }
  body.dark-mode .unmatched-sender { color: #f1f5f9; }
  .unmatched-channel { font-size: 12px; padding: 2px 8px; border-radius: 10px; background: #dbeafe; color: #1d4ed8; font-weight: 600; }
  .unmatched-message { background: #f8fafc; border-radius: 8px; padding: 10px 12px; font-size: 13px; color: #374151; margin-bottom: 10px; border-left: 3px solid #d1d5db; }
  body.dark-mode .unmatched-message { background: #1e293b; color: #cbd5e1; }
  .unmatched-ai { display: flex; align-items: flex-start; gap: 10px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; }
  body.dark-mode .unmatched-ai { background: #052e16; border-color: #166534; }
  .unmatched-ai-label { font-size: 11px; font-weight: 700; color: #15803d; margin-bottom: 2px; }
  body.dark-mode .unmatched-ai-label { color: #4ade80; }
  .unmatched-ai-doctor { font-weight: 600; font-size: 13px; color: #111827; }
  body.dark-mode .unmatched-ai-doctor { color: #f1f5f9; }
  .unmatched-ai-reason { font-size: 12px; color: #6b7280; }
  .confidence-badge { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; }
  .unmatched-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .unmatched-btn { padding: 7px 14px; border-radius: 8px; border: none; font-size: 12px; font-weight: 600; cursor: pointer; }
  .unmatched-btn.accept { background: #16a34a; color: #fff; }
  .unmatched-btn.accept:hover { background: #15803d; }
  .unmatched-btn.decline { background: #f3f4f6; color: #374151; }
  .unmatched-btn.decline:hover { background: #e5e7eb; }
  .unmatched-assign { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .unmatched-assign select { padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 12px; min-width: 160px; }
  .unmatched-assign .unmatched-btn { background: #1d4ed8; color: #fff; }
  .unmatched-assign .unmatched-btn:hover { background: #1e40af; }
  .unmatched-timestamp { font-size: 11px; color: #9ca3af; }
`;

function UnmatchedSection() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [doctors, setDoctors] = useState([]);
  const [assignSelections, setAssignSelections] = useState({});
  const [working, setWorking] = useState({});

  const fetchLogs = useCallback(async () => {
    try {
      const res = await communicationLogService.getUnmatched();
      setLogs(res.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    doctorService.getAll({ limit: 200 }).then((res) => setDoctors(res.data || [])).catch(() => {});
  }, [fetchLogs]);

  const handleAccept = async (log) => {
    const suggestedId = log.aiMatchSuggestion?.doctorId?._id || log.aiMatchSuggestion?.doctorId;
    if (!suggestedId) return;
    setWorking((w) => ({ ...w, [log._id]: true }));
    try {
      await communicationLogService.assign(log._id, suggestedId);
      setLogs((prev) => prev.filter((l) => l._id !== log._id));
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to assign.');
    } finally {
      setWorking((w) => ({ ...w, [log._id]: false }));
    }
  };

  const handleAssignDifferent = async (log) => {
    const doctorId = assignSelections[log._id];
    if (!doctorId) return;
    setWorking((w) => ({ ...w, [log._id]: true }));
    try {
      await communicationLogService.assign(log._id, doctorId);
      setLogs((prev) => prev.filter((l) => l._id !== log._id));
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to assign.');
    } finally {
      setWorking((w) => ({ ...w, [log._id]: false }));
    }
  };

  const handleDecline = async (log) => {
    setWorking((w) => ({ ...w, [log._id]: true }));
    try {
      await communicationLogService.decline(log._id);
      setLogs((prev) => prev.filter((l) => l._id !== log._id));
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to decline.');
    } finally {
      setWorking((w) => ({ ...w, [log._id]: false }));
    }
  };

  if (loading) return <div className="unmatched-empty">Loading unmatched messages…</div>;
  if (logs.length === 0) return <div className="unmatched-empty">No unmatched messages. All inbound senders are linked.</div>;

  return (
    <div>
      {logs.map((log) => {
        const suggestion = log.aiMatchSuggestion;
        const suggestedDoctor = suggestion?.doctorId;
        const suggestedName = suggestedDoctor
          ? `${suggestedDoctor.firstName} ${suggestedDoctor.lastName}`
          : null;
        const conf = suggestion?.confidence;
        const isWorking = working[log._id];

        return (
          <div key={log._id} className="unmatched-card">
            <div className="unmatched-header">
              <div>
                <div className="unmatched-sender">
                  {log.senderName || log.senderExternalId || 'Unknown Sender'}
                </div>
                <div className="unmatched-timestamp">
                  {new Date(log.contactedAt).toLocaleString()} &middot; {log.channel}
                </div>
              </div>
              <span className="unmatched-channel">{log.channel}</span>
            </div>

            <div className="unmatched-message">
              {log.messageContent || '(no message text)'}
            </div>

            {suggestion && suggestedDoctor ? (
              <div className="unmatched-ai">
                <div style={{ flex: 1 }}>
                  <div className="unmatched-ai-label">AI Suggestion</div>
                  <div className="unmatched-ai-doctor">
                    {suggestedName}
                    {suggestedDoctor.specialization && (
                      <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 6 }}>
                        — {suggestedDoctor.specialization}
                      </span>
                    )}
                  </div>
                  {suggestion.reason && <div className="unmatched-ai-reason">{suggestion.reason}</div>}
                </div>
                {conf && (
                  <span
                    className="confidence-badge"
                    style={{ background: CONFIDENCE_BG[conf], color: CONFIDENCE_COLOR[conf] }}
                  >
                    {conf}
                  </span>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>
                No AI suggestion available.
              </div>
            )}

            <div className="unmatched-actions">
              {suggestion && suggestedDoctor && (
                <button
                  className="unmatched-btn accept"
                  onClick={() => handleAccept(log)}
                  disabled={isWorking}
                >
                  Accept AI Match
                </button>
              )}

              <div className="unmatched-assign">
                <select
                  value={assignSelections[log._id] || ''}
                  onChange={(e) => setAssignSelections((s) => ({ ...s, [log._id]: e.target.value }))}
                >
                  <option value="">Assign to different VIP Client…</option>
                  {doctors.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.firstName} {d.lastName}
                      {d.specialization ? ` (${d.specialization})` : ''}
                    </option>
                  ))}
                </select>
                {assignSelections[log._id] && (
                  <button
                    className="unmatched-btn"
                    onClick={() => handleAssignDifferent(log)}
                    disabled={isWorking}
                  >
                    Assign
                  </button>
                )}
              </div>

              <button
                className="unmatched-btn decline"
                onClick={() => handleDecline(log)}
                disabled={isWorking}
              >
                Decline
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const CommLogsPage = () => {
  const [bdms, setBdms] = useState([]);
  const [selectedBdm, setSelectedBdm] = useState('');
  const [activeTab, setActiveTab] = useState('unmatched');

  useEffect(() => {
    const fetchBdms = async () => {
      try {
        const result = await userService.getAll({ role: 'staff', limit: 100 });
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

          <div className="aclp-tabs">
            <button
              className={`aclp-tab${activeTab === 'unmatched' ? ' active' : ''}`}
              onClick={() => setActiveTab('unmatched')}
            >
              Unmatched Messages
            </button>
            <button
              className={`aclp-tab${activeTab === 'all' ? ' active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              All Logs
            </button>
          </div>

          {activeTab === 'unmatched' && <UnmatchedSection />}

          {activeTab === 'all' && (
            <>
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
              <CommLogList mode="admin" adminFilters={adminFilters} />
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default CommLogsPage;
