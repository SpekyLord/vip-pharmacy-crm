import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useErpApi from '../hooks/useErpApi';
import { showError } from '../utils/errorToast';

const pageStyles = `
  .plk-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .plk-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .plk-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .plk-header h2 { font-size: 20px; font-weight: 700; margin: 0; color: var(--erp-text); }
  .plk-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .btn { padding: 7px 14px; border-radius: 8px; border: none; cursor: pointer; font-size: 13px; font-weight: 600; }
  .btn-primary { background: var(--erp-accent, #2563eb); color: #fff; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border); color: var(--erp-text); }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .plk-panel { background: var(--erp-panel); border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06); overflow-x: auto; }
  .plk-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 700px; }
  .plk-table th { padding: 8px 6px; font-size: 11px; font-weight: 600; color: var(--erp-muted); text-transform: uppercase; background: var(--erp-accent-soft, #e8efff); text-align: center; white-space: nowrap; }
  .plk-table th:first-child { text-align: left; min-width: 120px; }
  .plk-table td { padding: 6px; border-top: 1px solid var(--erp-border); text-align: center; }
  .plk-table td:first-child { text-align: left; font-weight: 600; font-size: 12px; color: var(--erp-text); }
  .plk-table tr:hover { background: var(--erp-accent-soft); }
  .lock-cell { cursor: pointer; padding: 8px; border-radius: 6px; transition: .15s; user-select: none; display: inline-flex; align-items: center; justify-content: center; min-width: 36px; min-height: 36px; }
  .lock-cell:hover { opacity: .8; }
  .lock-cell.locked { background: #fef2f2; color: #dc2626; }
  .lock-cell.unlocked { background: #f0fdf4; color: #16a34a; }
  .lock-icon { font-size: 18px; }
  .plk-year-select { padding: 6px 10px; border-radius: 8px; border: 1px solid var(--erp-border); font-size: 14px; font-weight: 600; background: var(--erp-panel); color: var(--erp-text); }
  .plk-legend { display: flex; gap: 16px; margin-top: 12px; font-size: 12px; color: var(--erp-muted); }
  .plk-legend span { display: flex; align-items: center; gap: 4px; }
  .plk-confirm { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .plk-confirm-body { background: var(--erp-panel); border-radius: 12px; padding: 24px; width: 360px; max-width: 95vw; text-align: center; }
  .plk-confirm-body h3 { margin: 0 0 8px; font-size: 16px; color: var(--erp-text); }
  .plk-confirm-body p { font-size: 13px; color: var(--erp-muted); margin: 0 0 20px; }
  @media(max-width: 768px) {
    .plk-main { padding: 12px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
  }
  @media(max-width: 375px) {
    .plk-main { padding: 8px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
    .form-group input, .form-group select, .plk-year-select { font-size: 16px; }
  }
`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MODULE_LABELS = {
  SALES: 'Sales', COLLECTION: 'Collections', EXPENSE: 'Expenses', JOURNAL: 'Journals',
  PAYROLL: 'Payroll', PURCHASING: 'Purchasing', INVENTORY: 'Inventory',
  BANKING: 'Banking', PETTY_CASH: 'Petty Cash', IC_TRANSFER: 'IC Transfers'
};

export function PeriodLocksContent() {
  const { user } = useAuth();
  const api = useErpApi();
  const canToggle = ['admin', 'finance', 'president'].includes(user?.role);

  const [year, setYear] = useState(new Date().getFullYear());
  const [matrix, setMatrix] = useState({});
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(null); // { module, month }
  const [toggling, setToggling] = useState(false);

  const loadLocks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/period-locks', { params: { year } });
      setMatrix(res?.data?.matrix || {});
    } catch (err) { showError(err, 'Period locks operation failed'); }
    setLoading(false);
  }, [year]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadLocks(); }, [loadLocks]);

  const handleToggle = async () => {
    if (!confirm) return;
    setToggling(true);
    try {
      await api.post('/period-locks/toggle', { module: confirm.module, year, month: confirm.month });
      setConfirm(null);
      loadLocks();
    } catch (err) { showError(err, 'Period locks operation failed'); }
    setToggling(false);
  };

  const handleExport = async () => {
    try {
      const res = await api.get('/period-locks/export', { params: { year }, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res]));
      const a = document.createElement('a'); a.href = url; a.download = `period-locks-${year}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { showError(err, 'Period locks operation failed'); }
  };

  const years = [];
  const thisYear = new Date().getFullYear();
  for (let y = thisYear - 2; y <= thisYear + 1; y++) years.push(y);

  return (
    <>
      <style>{pageStyles}</style>
      <div className="plk-header">
        <h2>Period Locks</h2>
        <div className="plk-controls">
          <select className="plk-year-select" value={year} onChange={e => setYear(parseInt(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="btn btn-outline" onClick={handleExport}>Export Excel</button>
        </div>
      </div>

      <div className="plk-panel">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--erp-muted)' }}>Loading...</div>
        ) : (
          <table className="plk-table">
            <thead>
              <tr>
                <th>Module</th>
                {MONTHS.map(m => <th key={m}>{m}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.keys(MODULE_LABELS).map(mod => (
                <tr key={mod}>
                  <td>{MODULE_LABELS[mod]}</td>
                  {MONTHS.map((_, i) => {
                    const isLocked = matrix[mod]?.[i + 1] || false;
                    return (
                      <td key={i}>
                        <span
                          className={`lock-cell ${isLocked ? 'locked' : 'unlocked'}`}
                          onClick={() => canToggle && setConfirm({ module: mod, month: i + 1 })}
                          title={canToggle ? `Click to ${isLocked ? 'unlock' : 'lock'}` : (isLocked ? 'Locked' : 'Unlocked')}
                          style={{ cursor: canToggle ? 'pointer' : 'default' }}
                        >
                          <span className="lock-icon">{isLocked ? '🔒' : '🔓'}</span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="plk-legend">
        <span><span className="lock-icon">🔒</span> Locked — no posting allowed</span>
        <span><span className="lock-icon">🔓</span> Unlocked — posting allowed</span>
      </div>

      {/* Confirm Dialog */}
      {confirm && (
        <div className="plk-confirm" onClick={() => setConfirm(null)}>
          <div className="plk-confirm-body" onClick={e => e.stopPropagation()}>
            <h3>{matrix[confirm.module]?.[confirm.month] ? 'Unlock' : 'Lock'} Period?</h3>
            <p>
              {matrix[confirm.module]?.[confirm.month] ? 'Unlock' : 'Lock'}{' '}
              <strong>{MODULE_LABELS[confirm.module]}</strong> for{' '}
              <strong>{MONTHS[confirm.month - 1]} {year}</strong>?
              {!matrix[confirm.module]?.[confirm.month] && <><br />This will prevent any posting to this module for the selected month.</>}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn btn-outline" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleToggle} disabled={toggling}>
                {toggling ? 'Processing...' : (matrix[confirm.module]?.[confirm.month] ? 'Unlock' : 'Lock')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function PeriodLocks() {
  return (
    <div className="plk-page">
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main className="plk-main admin-main">
          <PeriodLocksContent />
        </main>
      </div>
    </div>
  );
}
