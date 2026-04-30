import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useBanking from '../hooks/useBanking';
import { showError } from '../utils/errorToast';

import SelectField from '../../components/common/Select';
import WorkflowGuide from '../components/WorkflowGuide';
import RejectionBanner from '../components/RejectionBanner';

const pageStyles = `
  .br-container { background: var(--erp-bg, #f4f7fb); min-height: 100vh; display: flex; flex-direction: column; }
  .br-main { flex: 1; min-width: 0; padding: 20px; max-width: 1400px; margin: 0 auto; width: 100%; }
  .br-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .br-header h2 { margin: 0; font-size: 20px; }
  .br-controls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; }
  .br-controls select, .br-controls input { padding: 7px 10px; border-radius: 6px; border: 1px solid var(--erp-border, #e5e7eb); font-size: 13px; }
  .br-panel { background: var(--erp-panel, #fff); border-radius: 12px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
  .br-panel h3 { margin: 0 0 12px; font-size: 15px; }
  .br-split { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .br-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .br-table th { background: var(--erp-accent-soft, #e8efff); padding: 8px 10px; text-align: left; font-weight: 600; color: var(--erp-muted, #6b7280); text-transform: uppercase; letter-spacing: .3px; font-size: 11px; }
  .br-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border, #e5e7eb); }
  .br-table tr:hover td { background: #f8fafc; }
  .match-MATCHED { color: #166534; font-weight: 600; }
  .match-UNMATCHED { color: #dc2626; font-weight: 600; }
  .match-RECONCILING_ITEM { color: #b45309; font-weight: 600; }
  .br-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
  .br-stat { background: var(--erp-panel, #fff); border-radius: 10px; padding: 14px; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
  .br-stat-val { font-size: 22px; font-weight: 700; font-family: 'Courier New', monospace; }
  .br-stat-label { font-size: 11px; color: var(--erp-muted, #6b7280); margin-top: 4px; text-transform: uppercase; }
  .btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-warning { background: #d97706; color: #fff; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border, #e5e7eb); color: var(--erp-muted, #6b7280); }
  .btn-sm { padding: 4px 10px; font-size: 12px; }
  .br-msg { padding: 8px 14px; border-radius: 8px; margin-bottom: 12px; font-size: 13px; }
  .br-msg-ok { background: #dcfce7; color: #166534; }
  .br-msg-err { background: #fee2e2; color: #dc2626; }
  .br-upload { border: 2px dashed var(--erp-border, #e5e7eb); border-radius: 10px; padding: 20px; text-align: center; cursor: pointer; color: var(--erp-muted, #6b7280); margin-bottom: 16px; }
  .br-upload:hover { border-color: var(--erp-accent, #1e5eff); color: var(--erp-accent, #1e5eff); }
  .money { font-family: 'Courier New', monospace; text-align: right; }
  .br-modal { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .br-modal-body { background: var(--erp-panel, #fff); border-radius: 12px; padding: 24px; width: 500px; max-width: 95vw; }
  .br-fg { margin-bottom: 12px; }
  .br-fg label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: var(--erp-muted, #6b7280); }
  .br-fg input { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--erp-border, #e5e7eb); font-size: 13px; box-sizing: border-box; }
  @media(max-width: 900px) { .br-split { grid-template-columns: 1fr; } .br-main { padding: 12px; } }
`;

export default function BankReconciliation() {
  const api = useBanking();

  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedBank, setSelectedBank] = useState('');
  const [period, setPeriod] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const [statements, setStatements] = useState([]);
  const [activeStatement, setActiveStatement] = useState(null);
  const [reconSummary, setReconSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [closingBal, setClosingBal] = useState('');

  const showMsg = (text, type = 'ok') => { setMsg({ text, type }); setTimeout(() => setMsg(null), 4000); };
  const fmt = (n) => n != null ? Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';

  // Load bank accounts
  useEffect(() => {
    (async () => {
      try {
        const res = await api.listBankAccounts({ is_active: true });
        const accts = res?.data || [];
        setBankAccounts(accts);
        if (accts.length > 0 && !selectedBank) setSelectedBank(accts[0]._id);
      } catch (err) { showError(err, 'Could not load bank accounts'); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load statements when bank/period changes
  const loadStatements = useCallback(async () => {
    if (!selectedBank) return;
    setLoading(true);
    try {
      const res = await api.listStatements({ bank_account_id: selectedBank, period });
      setStatements(res?.data || []);
      setActiveStatement(null);
      setReconSummary(null);
    } catch (err) { showError(err, 'Could not load bank statements'); }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBank, period]);

  useEffect(() => { loadStatements(); }, [loadStatements]);

  // Parse CSV and import
  const handleCSVImport = async () => {
    try {
      const lines = csvText.trim().split('\n');
      if (lines.length < 2) return showMsg('CSV must have header + data rows', 'err');

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const entries = [];
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',').map(v => v.trim());
        const row = {};
        headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
        entries.push({
          txn_date: row.date || row.txn_date || row.transaction_date || '',
          description: row.description || row.desc || row.narrative || '',
          reference: row.reference || row.ref || row.check_no || '',
          debit: parseFloat(row.debit || row.withdrawal || 0) || 0,
          credit: parseFloat(row.credit || row.deposit || 0) || 0,
          balance: row.balance ? parseFloat(row.balance) : undefined
        });
      }

      await api.importStatement({
        bank_account_id: selectedBank,
        statement_date: new Date().toISOString(),
        period,
        entries,
        closing_balance: parseFloat(closingBal) || 0
      });

      showMsg(`Imported ${entries.length} entries`);
      setShowUpload(false);
      setCsvText('');
      setClosingBal('');
      loadStatements();
    } catch (err) {
      showMsg(err.response?.data?.message || 'Import failed', 'err');
    }
  };

  // Load a specific statement + recon summary
  const openStatement = async (stmt) => {
    setActiveStatement(stmt);
    try {
      const res = await api.getReconSummary(stmt._id);
      setReconSummary(res?.data || null);
    } catch (err) { showError(err, 'Could not load reconciliation summary'); }
  };

  const handleAutoMatch = async () => {
    if (!activeStatement) return;
    try {
      const res = await api.autoMatchStatement(activeStatement._id);
      showMsg(`Auto-matched ${res?.data?.matchCount || 0} of ${res?.data?.totalEntries || 0} entries`);
      await openStatement(activeStatement);
      loadStatements();
    } catch (err) {
      showMsg(err.response?.data?.message || 'Auto-match failed', 'err');
    }
  };

  const handleFinalize = async () => {
    if (!activeStatement) return;
    try {
      const res = await api.finalizeRecon(activeStatement._id);
      if (res?.approval_pending) { showMsg(res.message || 'Approval required — request sent to approver.'); loadStatements(); return; }
      showMsg('Reconciliation finalized');
      loadStatements();
      setActiveStatement(null);
      setReconSummary(null);
    } catch (err) {
      if (err?.response?.data?.approval_pending) { showMsg(err.response.data.message || 'Approval required'); loadStatements(); return; }
      showMsg(err.response?.data?.message || 'Finalize failed', 'err');
    }
  };

  return (
    <div className="br-container">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main className="br-main admin-main">
          <WorkflowGuide pageKey="bank-reconciliation" />
          <div className="br-header">
            <h2>Bank Reconciliation</h2>
            <button className="btn btn-primary" onClick={() => setShowUpload(true)}>Upload Statement</button>
          </div>

          {msg && <div className={`br-msg br-msg-${msg.type}`}>{msg.text}</div>}

          <div className="br-controls">
            <SelectField value={selectedBank} onChange={e => setSelectedBank(e.target.value)}>
              {bankAccounts.map(b => <option key={b._id} value={b._id}>{b.bank_name} ({b.bank_code})</option>)}
            </SelectField>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
          </div>

          {/* Statement List */}
          {!activeStatement && (
            <div className="br-panel">
              <h3>Statements</h3>
              {loading ? <div style={{ color: '#888' }}>Loading...</div> :
                statements.length === 0 ? <div style={{ color: '#888' }}>No statements for this period. Upload a CSV to get started.</div> : (
                <table className="br-table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Bank</th>
                      <th>Entries</th>
                      <th>Matched</th>
                      <th style={{ textAlign: 'right' }}>Closing Bal.</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statements.map(s => (
                      <tr key={s._id}>
                        <td>{s.period}</td>
                        <td>{s.bank_account_id?.bank_name || '—'}</td>
                        <td>{s.entry_count}</td>
                        <td>{s.matched_count} / {s.entry_count}</td>
                        <td className="money">{fmt(s.closing_balance)}</td>
                        <td>
                          <span className={`match-${s.status === 'FINALIZED' ? 'MATCHED' : s.status === 'IN_PROGRESS' ? 'RECONCILING_ITEM' : 'UNMATCHED'}`}>{s.status}</span>
                          <div style={{ marginTop: 4 }}>
                            <RejectionBanner row={s} moduleKey="BANKING" variant="row" />
                          </div>
                        </td>
                        <td><button className="btn btn-sm btn-primary" onClick={() => openStatement(s)}>Open</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Active Statement — Reconciliation View */}
          {activeStatement && reconSummary && (
            <>
              <RejectionBanner
                row={activeStatement}
                moduleKey="BANKING"
                variant="page"
                docLabel={`${activeStatement.period} — ${activeStatement.bank_account_id?.bank_name || ''}`}
                onResubmit={() => { setActiveStatement(null); setReconSummary(null); }}
              />
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                <button className="btn btn-outline" onClick={() => { setActiveStatement(null); setReconSummary(null); }}>&larr; Back</button>
                <span style={{ fontWeight: 600 }}>{activeStatement.period} — {activeStatement.bank_account_id?.bank_name}</span>
                <span className={`match-${reconSummary.status === 'FINALIZED' ? 'MATCHED' : 'UNMATCHED'}`}>{reconSummary.status}</span>
                {reconSummary.status !== 'FINALIZED' && (
                  <>
                    <button className="btn btn-warning btn-sm" onClick={handleAutoMatch}>Auto-Match</button>
                    <button className="btn btn-success btn-sm" onClick={handleFinalize}>Finalize</button>
                  </>
                )}
              </div>

              {/* Summary Stats */}
              <div className="br-summary" style={{ marginBottom: 16 }}>
                <div className="br-stat">
                  <div className="br-stat-val">{fmt(reconSummary.closing_balance)}</div>
                  <div className="br-stat-label">Bank Balance</div>
                </div>
                <div className="br-stat">
                  <div className="br-stat-val">{fmt(reconSummary.book_balance)}</div>
                  <div className="br-stat-label">Book Balance</div>
                </div>
                <div className="br-stat">
                  <div className="br-stat-val">{fmt(reconSummary.adjusted_bank_balance)}</div>
                  <div className="br-stat-label">Adj. Bank Balance</div>
                </div>
                <div className="br-stat">
                  <div className="br-stat-val">{fmt(reconSummary.adjusted_book_balance)}</div>
                  <div className="br-stat-label">Adj. Book Balance</div>
                </div>
                <div className="br-stat">
                  <div className="br-stat-val" style={{ color: reconSummary.difference === 0 ? '#166534' : '#dc2626' }}>{fmt(reconSummary.difference)}</div>
                  <div className="br-stat-label">Difference</div>
                </div>
              </div>

              {/* Side-by-side: Bank vs Book */}
              <div className="br-split">
                <div className="br-panel">
                  <h3>Bank Statement Entries ({reconSummary.matched.length + reconSummary.unmatched_bank.length})</h3>
                  <table className="br-table">
                    <thead>
                      <tr><th>#</th><th>Date</th><th>Description</th><th>Debit</th><th>Credit</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {[...reconSummary.matched, ...reconSummary.unmatched_bank].sort((a, b) => (a.line_no || 0) - (b.line_no || 0)).map((e) => (
                        <tr key={e._id || `bank-${e.line_no}`}>
                          <td>{e.line_no}</td>
                          <td>{e.txn_date ? new Date(e.txn_date).toLocaleDateString() : '—'}</td>
                          <td>{e.description || e.reference || '—'}</td>
                          <td className="money">{e.debit > 0 ? fmt(e.debit) : ''}</td>
                          <td className="money">{e.credit > 0 ? fmt(e.credit) : ''}</td>
                          <td><span className={`match-${e.match_status}`}>{e.match_status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="br-panel">
                  <h3>Unmatched Book Entries ({reconSummary.unmatched_book.length})</h3>
                  {reconSummary.unmatched_book.length === 0 ? <div style={{ color: '#888', padding: 12 }}>All book entries matched</div> : (
                    <table className="br-table">
                      <thead>
                        <tr><th>JE#</th><th>Date</th><th>Description</th><th>Debit</th><th>Credit</th></tr>
                      </thead>
                      <tbody>
                        {reconSummary.unmatched_book.map((e) => (
                          <tr key={e._id || e.je_number}>
                            <td>{e.je_number}</td>
                            <td>{e.je_date ? new Date(e.je_date).toLocaleDateString() : '—'}</td>
                            <td>{e.description || '—'}</td>
                            <td className="money">{e.debit > 0 ? fmt(e.debit) : ''}</td>
                            <td className="money">{e.credit > 0 ? fmt(e.credit) : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Upload CSV Modal */}
          {showUpload && (
            <div className="br-modal" onClick={() => setShowUpload(false)}>
              <div className="br-modal-body" onClick={e => e.stopPropagation()}>
                <h3 style={{ marginTop: 0 }}>Import Bank Statement (CSV)</h3>
                <p style={{ fontSize: 12, color: '#888', margin: '0 0 12px' }}>
                  CSV columns: date, description, reference, debit, credit, balance
                </p>
                <div className="br-fg">
                  <label>Paste CSV content</label>
                  <textarea
                    rows={8}
                    value={csvText}
                    onChange={e => setCsvText(e.target.value)}
                    placeholder="date,description,reference,debit,credit,balance&#10;2026-04-01,Check #1234,CHK1234,5000,0,95000&#10;..."
                    style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }}
                  />
                </div>
                <div className="br-fg">
                  <label>Closing Balance</label>
                  <input type="number" step="0.01" value={closingBal} onChange={e => setClosingBal(e.target.value)} placeholder="e.g. 150000.00" />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="btn btn-outline" onClick={() => setShowUpload(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleCSVImport} disabled={!csvText.trim()}>Import</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
