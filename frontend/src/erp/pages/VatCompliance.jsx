import React, { useState, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useAccounting from '../hooks/useAccounting';
import { showError } from '../utils/errorToast';

import SelectField from '../../components/common/Select';
import WorkflowGuide from '../components/WorkflowGuide';

const pageStyles = `
  .vat-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .vat-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .vat-header h2 { font-size: 20px; font-weight: 700; margin: 0 0 16px; }
  .vat-tabs { display: flex; gap: 4px; background: var(--erp-panel); border-radius: 8px; padding: 3px; margin-bottom: 14px; width: fit-content; }
  .vat-tabs button { padding: 6px 14px; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; background: transparent; }
  .vat-tabs button.active { background: var(--erp-accent); color: #fff; }
  .vat-controls { display: flex; gap: 8px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
  .vat-controls input, .vat-controls select { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; }
  .btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 12px; }
  .vat-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--erp-panel); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .vat-table th { background: var(--erp-accent-soft, #e8efff); padding: 10px; text-align: left; font-size: 11px; font-weight: 600; }
  .vat-table td { padding: 10px; border-top: 1px solid var(--erp-border); }
  .tag-badge { padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; cursor: pointer; }
  .tag-PENDING { background: #f3f4f6; color: #6b7280; }
  .tag-INCLUDE { background: #dcfce7; color: #166534; }
  .tag-EXCLUDE { background: #fee2e2; color: #dc2626; }
  .tag-DEFER { background: #fef3c7; color: #92400e; }
  .vat-summary { background: var(--erp-panel); border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .vat-summary-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
  .vat-summary-row.total { font-weight: 700; font-size: 16px; border-top: 2px solid var(--erp-border); padding-top: 12px; }
  .vat-empty { text-align: center; color: #64748b; padding: 40px; }
  @media(max-width: 768px) { .vat-main { padding: 12px; } }
`;

const getCurrentPeriod = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const fmt = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const getCurrentYear = () => new Date().getFullYear();

export default function VatCompliance() {
  const { user } = useAuth();
  const api = useAccounting();
  const isAdmin = ['admin', 'finance', 'president'].includes(user?.role);

  const [tab, setTab] = useState('vat-ledger');
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [quarter, setQuarter] = useState('Q1');
  const [year, setYear] = useState(getCurrentYear());
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadVatLedger = useCallback(async () => {
    setLoading(true);
    try { const res = await api.getVatLedger(period); setData(res?.data || []); } catch (err) { showError(err, 'Could not load VAT ledger'); }
    setLoading(false);
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadVatReturn = useCallback(async () => {
    setLoading(true);
    try { const res = await api.getVatReturn(quarter, year); setSummary(res?.data || null); } catch (err) { showError(err, 'Could not load VAT return'); }
    setLoading(false);
  }, [quarter, year]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadCwtLedger = useCallback(async () => {
    setLoading(true);
    try { const res = await api.getCwtLedger(period); setData(res?.data || []); } catch (err) { showError(err, 'Could not load CWT ledger'); }
    setLoading(false);
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadCwtSummary = useCallback(async () => {
    setLoading(true);
    try { const res = await api.getCwtSummary(quarter, year); setSummary(res?.data || null); } catch (err) { showError(err, 'Could not load CWT summary'); }
    setLoading(false);
  }, [quarter, year]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTag = async (id, tag) => {
    try { await api.tagVatEntry(id, { tag }); loadVatLedger(); } catch (err) { showError(err, 'Could not tag VAT entry'); }
  };

  return (
    <div className="vat-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main className="vat-main admin-main">
          <WorkflowGuide pageKey="vat-compliance" />
          <div className="vat-header"><h2>VAT & CWT Compliance</h2></div>
          <div className="vat-tabs">
            {['vat-ledger', '2550Q', 'cwt-ledger', '2307'].map(t => (
              <button key={t} className={tab === t ? 'active' : ''} onClick={() => { setTab(t); setData([]); setSummary(null); }}>{t.toUpperCase()}</button>
            ))}
          </div>

          {(tab === 'vat-ledger' || tab === 'cwt-ledger') && (
            <div className="vat-controls">
              <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
              <button className="btn btn-primary" onClick={tab === 'vat-ledger' ? loadVatLedger : loadCwtLedger} disabled={loading}>
                {loading ? 'Loading…' : 'Load'}
              </button>
            </div>
          )}

          {(tab === '2550Q' || tab === '2307') && (
            <div className="vat-controls">
              <SelectField value={quarter} onChange={e => setQuarter(e.target.value)}>
                {['Q1', 'Q2', 'Q3', 'Q4'].map(q => <option key={q} value={q}>{q}</option>)}
              </SelectField>
              <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} style={{ width: 80 }} />
              <button className="btn btn-primary" onClick={tab === '2550Q' ? loadVatReturn : loadCwtSummary} disabled={loading}>
                {loading ? 'Computing…' : 'Compute'}
              </button>
            </div>
          )}

          {tab === 'vat-ledger' && (data.length === 0 ? <div className="vat-empty">No VAT entries</div> : (
            <table className="vat-table">
              <thead><tr><th>Type</th><th>Source</th><th>Doc Ref</th><th>Entity</th><th>Gross</th><th>VAT</th><th>Tag</th>{isAdmin && <th>Actions</th>}</tr></thead>
              <tbody>
                {data.map(e => (
                  <tr key={e._id}>
                    <td>{e.vat_type}</td><td>{e.source_module}</td><td>{e.source_doc_ref}</td>
                    <td>{e.hospital_or_vendor || '—'}</td><td>{fmt(e.gross_amount)}</td><td>{fmt(e.vat_amount)}</td>
                    <td><span className={`tag-badge tag-${e.finance_tag}`}>{e.finance_tag}</span></td>
                    {isAdmin && <td>
                      {['INCLUDE', 'EXCLUDE', 'DEFER'].map(t => (
                        <button key={t} className={`btn btn-sm tag-badge tag-${t}`} style={{ marginRight: 4, border: 'none', cursor: 'pointer' }} onClick={() => handleTag(e._id, t)}>{t}</button>
                      ))}
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

          {tab === '2550Q' && summary && (
            <div className="vat-summary">
              <h3>VAT Return 2550Q — {summary.quarter} {summary.year}</h3>
              <div className="vat-summary-row"><span>Output VAT ({summary.output_vat?.count} entries)</span><span>{fmt(summary.output_vat?.vat)}</span></div>
              <div className="vat-summary-row"><span>Input VAT ({summary.input_vat?.count} entries)</span><span>({fmt(summary.input_vat?.vat)})</span></div>
              <div className="vat-summary-row total">
                <span>Net VAT Payable</span>
                <span style={{ color: summary.net_vat_payable >= 0 ? '#dc2626' : '#16a34a' }}>{fmt(summary.net_vat_payable)}</span>
              </div>
            </div>
          )}

          {tab === 'cwt-ledger' && (data.length === 0 ? <div className="vat-empty">No CWT entries</div> : (
            <table className="vat-table">
              <thead><tr><th>Hospital TIN</th><th>CR No.</th><th>CR Date</th><th>CR Amount</th><th>CWT Rate</th><th>CWT Amount</th><th>Quarter</th></tr></thead>
              <tbody>
                {data.map(e => (
                  <tr key={e._id}>
                    <td>{e.hospital_tin || '—'}</td><td>{e.cr_no}</td>
                    <td>{e.cr_date ? new Date(e.cr_date).toLocaleDateString() : '—'}</td>
                    <td>{fmt(e.cr_amount)}</td><td>{(e.cwt_rate * 100).toFixed(1)}%</td>
                    <td>{fmt(e.cwt_amount)}</td><td>{e.quarter} {e.year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

          {tab === '2307' && summary && (
            <div className="vat-summary">
              <h3>CWT 2307 Summary — {summary.quarter} {summary.year}</h3>
              <p>{summary.hospital_count} hospitals, Grand Total CWT: {fmt(summary.grand_total_cwt)}</p>
              {(summary.hospitals || []).map((h, i) => (
                <div key={i} className="vat-summary-row">
                  <span>TIN: {h.hospital_tin || '—'} ({h.certificate_count} certs)</span>
                  <span>{fmt(h.total_cwt_amount)}</span>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
