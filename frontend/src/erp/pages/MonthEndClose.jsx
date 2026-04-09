import React, { useState, useCallback, useEffect, useRef } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_SETS } from '../../constants/roles';
import useAccounting from '../hooks/useAccounting';
import { showError } from '../utils/errorToast';
import WorkflowGuide from '../components/WorkflowGuide';

const pageStyles = `
  .mec-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .mec-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1000px; margin: 0 auto; }
  .mec-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .mec-header h2 { font-size: 20px; font-weight: 700; margin: 0; }
  .mec-controls { display: flex; gap: 8px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
  .mec-controls input { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; }
  .btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-warning { background: #f59e0b; color: #fff; }
  .btn-danger { background: #dc2626; color: #fff; }
  .mec-steps { background: var(--erp-panel); border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .mec-phase { margin-bottom: 16px; }
  .mec-phase-title { font-size: 14px; font-weight: 700; padding: 8px 0; border-bottom: 2px solid var(--erp-border); margin-bottom: 8px; }
  .mec-step { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 13px; }
  .mec-step-num { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; flex-shrink: 0; }
  .step-PENDING { background: #f3f4f6; color: #6b7280; }
  .step-RUNNING { background: #dbeafe; color: #1e40af; animation: pulse 1.5s infinite; }
  .step-COMPLETE { background: #dcfce7; color: #166534; }
  .step-ERROR { background: #fee2e2; color: #dc2626; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  .mec-step-name { flex: 1; }
  .mec-step-status { font-size: 11px; font-weight: 500; }
  .mec-step-error { font-size: 11px; color: #dc2626; margin-left: 38px; }
  .mec-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--erp-border); }
  .mec-status { margin-top: 12px; padding: 12px 16px; border-radius: 8px; font-size: 14px; font-weight: 600; }
  .mec-status-open { background: #dbeafe; color: #1e40af; }
  .mec-status-closed { background: #dcfce7; color: #166534; }
  .mec-status-locked { background: #f3f4f6; color: #6b7280; }
  .mec-empty { text-align: center; color: #64748b; padding: 40px; }
  @media(max-width: 768px) { .mec-main { padding: 12px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); } }
  @media(max-width: 375px) { .mec-main { padding: 8px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); } .mec-main input, .mec-main select { font-size: 16px; } }
`;

const getCurrentPeriod = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

const PHASE_LABELS = {
  1: 'Phase 1 — Data Collection',
  2: 'Phase 2 — Processing',
  3: 'Phase 3 — Journal Posting',
  4: 'Phase 4 — Tax Compliance',
  5: 'Phase 5 — Financial Reports',
  6: 'Phase 6 — Review & Staging',
  7: 'Phase 7 — Finalize'
};

export default function MonthEndClose() {
  const { user } = useAuth();
  const api = useAccounting();
  const isAdmin = ROLE_SETS.MANAGEMENT.includes(user?.role);

  const [period, setPeriod] = useState(getCurrentPeriod());
  const [progress, setProgress] = useState(null);
  const [_loading, _setLoading] = useState(false); // eslint-disable-line no-unused-vars
  const [running, setRunning] = useState(false);
  const pollRef = useRef(null);

  const loadProgress = useCallback(async () => {
    try {
      const res = await api.getCloseProgress(period);
      setProgress(res?.data || null);
    } catch (err) { showError(err, 'Could not load close progress'); }
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadProgress(); }, [loadProgress]);

  // Poll while running
  useEffect(() => {
    if (running) {
      pollRef.current = setInterval(loadProgress, 3000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [running, loadProgress]);

  const handleAutoClose = async () => {
    setRunning(true);
    try {
      await api.runAutoClose({ period });
      await loadProgress();
    } catch (err) { showError(err, 'Auto-close failed'); }
    setRunning(false);
  };

  const handleStaging = async () => {
    setRunning(true);
    try { await api.runStaging({ period }); await loadProgress(); } catch (err) { showError(err, 'Staging failed'); }
    setRunning(false);
  };

  const handlePostStaged = async () => {
    try { await api.postStagedItems({ period }); await loadProgress(); } catch (err) { showError(err, 'Post staged items failed'); }
  };

  const handleFinalize = async () => {
    if (!confirm(`Lock period ${period}? This cannot be undone.`)) return;
    try { await api.finalizeClose({ period }); await loadProgress(); } catch (err) { showError(err, 'Finalize close failed'); }
  };

  const steps = progress?.steps || [];
  const phases = {};
  for (const step of steps) {
    if (!phases[step.phase]) phases[step.phase] = [];
    phases[step.phase].push(step);
  }

  const completedCount = steps.filter(s => s.status === 'COMPLETE').length;
  const _hasErrors = steps.some(s => s.status === 'ERROR'); // eslint-disable-line no-unused-vars
  const isPaused = steps.some(s => s.step === 21 && s.status === 'RUNNING');
  const isFullyComplete = completedCount === 29;

  return (
    <div className="mec-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main className="mec-main admin-main">
          <WorkflowGuide pageKey="month-end-close" />
          <div className="mec-header"><h2>Month-End Close</h2></div>
          <div className="mec-controls">
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
            <button className="btn btn-primary" onClick={loadProgress}>Load Progress</button>
          </div>

          {progress?.period_status && (
            <div className={`mec-status mec-status-${progress.period_status.toLowerCase()}`}>
              Period: {period} — Status: {progress.period_status} — {completedCount}/29 steps complete
            </div>
          )}

          {steps.length === 0 ? (
            <div className="mec-empty">
              <p>No close process started for {period}</p>
              {isAdmin && <button className="btn btn-primary" onClick={handleAutoClose} disabled={running}>
                {running ? 'Running…' : 'Run Full Auto Close (Steps 1-17)'}
              </button>}
            </div>
          ) : (
            <div className="mec-steps">
              {Object.entries(phases).map(([phase, phaseSteps]) => (
                <div key={phase} className="mec-phase">
                  <div className="mec-phase-title">{PHASE_LABELS[phase] || `Phase ${phase}`}</div>
                  {phaseSteps.map(s => (
                    <React.Fragment key={s.step}>
                      <div className="mec-step">
                        <div className={`mec-step-num step-${s.status}`}>{s.step}</div>
                        <span className="mec-step-name">{s.name}</span>
                        <span className="mec-step-status">{s.status}</span>
                      </div>
                      {s.error && <div className="mec-step-error">{s.error}</div>}
                    </React.Fragment>
                  ))}
                </div>
              ))}

              {isAdmin && (
                <div className="mec-actions">
                  {completedCount < 17 && (
                    <button className="btn btn-primary" onClick={handleAutoClose} disabled={running}>
                      {running ? 'Running…' : 'Run Auto Close (1-17)'}
                    </button>
                  )}
                  {completedCount >= 17 && !isPaused && completedCount < 20 && (
                    <button className="btn btn-warning" onClick={handleStaging} disabled={running}>
                      Run Staging (18-21)
                    </button>
                  )}
                  {isPaused && (
                    <button className="btn btn-success" onClick={handlePostStaged}>
                      Approve & Post Staged Items (23-25)
                    </button>
                  )}
                  {completedCount >= 25 && !isFullyComplete && (
                    <button className="btn btn-danger" onClick={handleFinalize}>
                      Finalize & Lock Period (26-29)
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
