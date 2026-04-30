/**
 * SCPWDSalesBookPage — Phase VIP-1.H (Apr 2026)
 *
 * SC/PWD Sales Book (RA 9994 + RA 7277/9442 + BIR RR 7-2010). Admin / finance
 * land entries here, post them to the BIR-filing register, and export the
 * monthly CSV. Input VAT Credit Worksheet (BIR Form 2306) downloads as a
 * separate CSV labeled DRAFT until accountant review.
 *
 * Role gates are backend-driven (lookup SCPWD_ROLES). The route guard here is
 * admin-like to prevent BDM eyeballs on customer SC/PWD IDs.
 *
 * Route: /erp/scpwd-sales-book
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck, Download, RefreshCw, Search, Plus, X, Loader, AlertTriangle, FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import PageGuide from '../../components/common/PageGuide';
import scpwdService from '../../erp/services/scpwdService';

const STATUS_META = {
  DRAFT:  { label: 'DRAFT',  bg: '#fef3c7', fg: '#b45309' },
  POSTED: { label: 'POSTED', bg: '#dcfce7', fg: '#15803d' },
  VOID:   { label: 'VOID',   bg: '#fee2e2', fg: '#991b1b' },
};

function emptyEntry() {
  const now = new Date();
  return {
    sc_pwd_type: 'SC',
    osca_or_pwd_id: '',
    customer_name: '',
    transaction_date: now.toISOString().slice(0, 10),
    items: [{ product_name: '', qty: 1, unit_price: 0 }],
    notes: '',
  };
}

// Compute math from items so the user enters qty × unit_price and the page
// auto-derives the 20% discount + 12% VAT exemption split.
function computeTotals(items) {
  let gross = 0;
  for (const it of items) {
    gross += (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
  }
  const discount = gross * 0.20;
  const vatExempt = (gross - discount) * 0.12;
  const net = gross - discount - vatExempt;
  return { gross, discount, vatExempt, net };
}

function expandItems(items) {
  // Expand the user-input rows into the backend item shape (line_subtotal etc.)
  return items.map(it => {
    const qty = Number(it.qty) || 0;
    const unit_price = Number(it.unit_price) || 0;
    const line_subtotal = qty * unit_price;
    const line_discount = line_subtotal * 0.20;
    const line_vat_exempt = (line_subtotal - line_discount) * 0.12;
    const line_net = line_subtotal - line_discount - line_vat_exempt;
    return {
      product_name: it.product_name?.trim() || '',
      product_code: it.product_code || '',
      qty,
      unit_price,
      line_subtotal,
      line_discount,
      line_vat_exempt,
      line_net,
    };
  });
}

const styles = `
  .sb-layout { min-height: 100vh; background: #f3f4f6; }
  .sb-content { display: flex; }
  .sb-main { flex: 1; padding: 24px; max-width: 1400px; }
  .sb-header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
  .sb-header-icon { width: 48px; height: 48px; background: linear-gradient(135deg, #0ea5e9, #0284c7); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 12px rgba(2,132,199,.3); }
  .sb-header h1 { margin: 0; font-size: 28px; color: #1f2937; }
  .sb-header-sub { color: #6b7280; font-size: 13px; margin-top: 4px; }
  .sb-toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
  .sb-input { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; background: #fff; color: #374151; }
  .sb-search { flex: 1; min-width: 220px; position: relative; }
  .sb-search input { width: 100%; padding: 8px 12px 8px 36px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; }
  .sb-search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #9ca3af; }
  .sb-btn { padding: 8px 14px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; border: 1px solid #d1d5db; background: #fff; color: #374151; }
  .sb-btn:hover { background: #f9fafb; }
  .sb-btn.primary { background: #0284c7; border-color: #0284c7; color: #fff; }
  .sb-btn.primary:hover { background: #0369a1; border-color: #0369a1; }
  .sb-btn.danger { background: #fff; border-color: #fecaca; color: #b91c1c; }
  .sb-btn.danger:hover { background: #fef2f2; }
  .sb-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .sb-counts { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 16px; }
  .sb-count-card { background: #fff; border-radius: 10px; padding: 10px 12px; border: 1px solid #e5e7eb; }
  .sb-count-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: .5px; font-weight: 600; }
  .sb-count-value { font-size: 22px; font-weight: 700; color: #111827; margin-top: 4px; }

  .sb-table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.05); overflow: hidden; border: 1px solid #e5e7eb; }
  .sb-table { width: 100%; border-collapse: collapse; }
  .sb-table th { text-align: left; padding: 12px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #6b7280; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
  .sb-table td { padding: 12px 14px; font-size: 13px; color: #374151; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
  .sb-table tr:last-child td { border-bottom: none; }
  .sb-table tr:hover td { background: #fafafa; }
  .sb-pill { display: inline-block; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .sb-money { font-variant-numeric: tabular-nums; }
  .sb-empty { padding: 60px 20px; text-align: center; color: #6b7280; }

  .sb-modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
  .sb-modal { background: #fff; border-radius: 12px; width: 100%; max-width: 720px; max-height: 90vh; overflow: auto; }
  .sb-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; }
  .sb-modal-body { padding: 20px; }
  .sb-modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px; border-top: 1px solid #e5e7eb; background: #f9fafb; }
  .sb-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
  .sb-form-label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 4px; }
  .sb-form-input { width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; }
  .sb-items-table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; }
  .sb-items-table th, .sb-items-table td { font-size: 12px; padding: 6px 8px; border-bottom: 1px solid #f3f4f6; }
  .sb-items-table th { background: #f9fafb; color: #6b7280; text-align: left; font-weight: 600; }
  .sb-totals-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 12px; background: #f9fafb; border-radius: 8px; }
  .sb-totals-cell { text-align: center; }
  .sb-totals-label { font-size: 11px; color: #6b7280; text-transform: uppercase; }
  .sb-totals-value { font-size: 14px; font-weight: 700; color: #111827; }
`;

export default function SCPWDSalesBookPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [scPwdType, setScPwdType] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState(emptyEntry());
  const [saving, setSaving] = useState(false);

  const draftTotals = useMemo(() => computeTotals(draft.items), [draft.items]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = { year, month };
      if (scPwdType) params.sc_pwd_type = scPwdType;
      if (status) params.status = status;
      if (search.trim()) params.search = search.trim();
      const [listResp, summaryResp] = await Promise.all([
        scpwdService.listScpwdRows(params),
        scpwdService.getScpwdSummary({ year, month }),
      ]);
      setRows(listResp?.data || []);
      setSummary(summaryResp);
    } catch (err) {
      console.error('[SCPWDSalesBook] fetch failed', err);
      toast.error(err?.response?.data?.message || 'Failed to load SC/PWD register');
    } finally {
      setLoading(false);
    }
  }, [year, month, scPwdType, status, search]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleCreate = async () => {
    if (!draft.customer_name?.trim()) return toast.error('Customer name is required');
    if (!draft.osca_or_pwd_id?.trim()) return toast.error(`${draft.sc_pwd_type} ID is required`);
    if (!draft.items?.length) return toast.error('At least one line item is required');
    if (draft.items.some(i => !i.product_name?.trim() || !Number(i.qty) || !Number(i.unit_price))) {
      return toast.error('Every line needs product name, qty, and unit price');
    }

    setSaving(true);
    try {
      const items = expandItems(draft.items);
      const totals = computeTotals(draft.items);
      const payload = {
        sc_pwd_type: draft.sc_pwd_type,
        osca_or_pwd_id: draft.osca_or_pwd_id.trim(),
        customer_name: draft.customer_name.trim(),
        transaction_date: draft.transaction_date,
        items,
        gross_amount: totals.gross,
        discount_amount: totals.discount,
        vat_exempt_amount: totals.vatExempt,
        net_amount: totals.net,
        notes: draft.notes?.trim() || undefined,
        source_type: 'MANUAL',
      };
      const resp = await scpwdService.createScpwdRow(payload);
      if (resp?.success) {
        toast.success('SC/PWD entry created');
        setShowCreate(false);
        setDraft(emptyEntry());
        fetchAll();
      } else if (resp?.data) {
        toast.error(resp.message || 'Duplicate entry');
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Create failed';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handlePost = async (id) => {
    try {
      const resp = await scpwdService.postScpwdRow(id);
      if (resp?.success) {
        toast.success('Posted to BIR Sales Book');
        fetchAll();
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Post failed');
    }
  };

  const handleVoid = async (id) => {
    const reason = window.prompt('Void reason (audit trail):');
    if (!reason || !reason.trim()) return;
    try {
      const resp = await scpwdService.voidScpwdRow(id, reason.trim());
      if (resp?.success) {
        toast.success('Entry voided');
        fetchAll();
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Void failed');
    }
  };

  const handleExportMonthly = async () => {
    try {
      const r = await scpwdService.downloadMonthlyExport(year, month);
      toast.success(`Downloaded ${r.filename}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Export failed');
    }
  };

  const handleExportVatReclaim = async () => {
    if (!window.confirm('Input VAT Credit Worksheet is a DRAFT — review with your accredited tax accountant before filing with BIR. Continue?')) return;
    try {
      const r = await scpwdService.downloadVatReclaimExport(year, month);
      toast.success(`Downloaded ${r.filename}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Export failed');
    }
  };

  const counts = summary?.counts || { DRAFT: 0, POSTED: 0, VOID: 0 };
  const postedTotals = summary?.posted_totals || { count: 0, gross: 0, discount: 0, vat_exempt: 0, net: 0 };

  return (
    <div className="sb-layout">
      <style>{styles}</style>
      <Navbar />
      <div className="sb-content">
        <Sidebar />
        <main className="sb-main">
          <div className="sb-header">
            <div className="sb-header-icon"><ShieldCheck size={26} /></div>
            <div>
              <h1>SC / PWD Sales Book</h1>
              <div className="sb-header-sub">BIR-mandated register per RA 9994 + RA 7277/9442 + RR 7-2010. Monthly export, retained for BIR audit.</div>
            </div>
          </div>

          <PageGuide pageKey="scpwd-sales-book" />

          {/* Counts strip */}
          <div className="sb-counts">
            <div className="sb-count-card">
              <div className="sb-count-label">Draft</div>
              <div className="sb-count-value">{counts.DRAFT}</div>
            </div>
            <div className="sb-count-card">
              <div className="sb-count-label">Posted</div>
              <div className="sb-count-value">{counts.POSTED}</div>
            </div>
            <div className="sb-count-card">
              <div className="sb-count-label">Void</div>
              <div className="sb-count-value">{counts.VOID}</div>
            </div>
            <div className="sb-count-card">
              <div className="sb-count-label">Posted Gross</div>
              <div className="sb-count-value sb-money">₱{(postedTotals.gross || 0).toFixed(2)}</div>
            </div>
            <div className="sb-count-card">
              <div className="sb-count-label">VAT-Exempt</div>
              <div className="sb-count-value sb-money">₱{(postedTotals.vat_exempt || 0).toFixed(2)}</div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="sb-toolbar">
            <select className="sb-input" value={year} onChange={e => setYear(parseInt(e.target.value))}>
              {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select className="sb-input" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString('en', { month: 'long' })}</option>
              ))}
            </select>
            <select className="sb-input" value={scPwdType} onChange={e => setScPwdType(e.target.value)}>
              <option value="">All SC + PWD</option>
              <option value="SC">SC only</option>
              <option value="PWD">PWD only</option>
            </select>
            <select className="sb-input" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="POSTED">Posted</option>
              <option value="VOID">Void</option>
            </select>
            <div className="sb-search">
              <Search size={16} className="sb-search-icon" />
              <input
                type="text"
                placeholder="Customer name, ID, or doc ref"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button className="sb-btn" onClick={fetchAll} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'sb-spin' : ''} /> Refresh
            </button>
            <button className="sb-btn primary" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> New Entry
            </button>
            <button className="sb-btn" onClick={handleExportMonthly}>
              <Download size={14} /> Export Monthly CSV
            </button>
            <button className="sb-btn" onClick={handleExportVatReclaim} title="BIR Form 2306 — Input VAT Credit Worksheet (DRAFT until accountant review)">
              <FileText size={14} /> Export VAT Reclaim (DRAFT)
            </button>
          </div>

          {/* Table */}
          <div className="sb-table-card">
            {loading ? (
              <div className="sb-empty"><Loader size={20} className="sb-spin" /> Loading…</div>
            ) : rows.length === 0 ? (
              <div className="sb-empty">
                No SC/PWD entries for {new Date(year, month - 1).toLocaleString('en', { month: 'long' })} {year}.<br />
                Click <b>New Entry</b> to add the first transaction.
              </div>
            ) : (
              <table className="sb-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Doc Ref</th>
                    <th>Type</th>
                    <th>ID</th>
                    <th>Customer</th>
                    <th style={{ textAlign: 'right' }}>Gross</th>
                    <th style={{ textAlign: 'right' }}>Discount</th>
                    <th style={{ textAlign: 'right' }}>VAT-Exempt</th>
                    <th style={{ textAlign: 'right' }}>Net</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const meta = STATUS_META[r.status] || { label: r.status, bg: '#f3f4f6', fg: '#374151' };
                    return (
                      <tr key={r._id}>
                        <td>{r.transaction_date ? new Date(r.transaction_date).toISOString().slice(0, 10) : ''}</td>
                        <td><code style={{ fontSize: 11 }}>{r.source_doc_ref}</code></td>
                        <td>{r.sc_pwd_type}</td>
                        <td>{r.osca_or_pwd_id}</td>
                        <td>{r.customer_name}</td>
                        <td className="sb-money" style={{ textAlign: 'right' }}>₱{(r.gross_amount || 0).toFixed(2)}</td>
                        <td className="sb-money" style={{ textAlign: 'right' }}>₱{(r.discount_amount || 0).toFixed(2)}</td>
                        <td className="sb-money" style={{ textAlign: 'right' }}>₱{(r.vat_exempt_amount || 0).toFixed(2)}</td>
                        <td className="sb-money" style={{ textAlign: 'right' }}>₱{(r.net_amount || 0).toFixed(2)}</td>
                        <td><span className="sb-pill" style={{ background: meta.bg, color: meta.fg }}>{meta.label}</span></td>
                        <td>
                          {r.status === 'DRAFT' && (
                            <button className="sb-btn primary" onClick={() => handlePost(r._id)}>Post</button>
                          )}
                          {r.status === 'POSTED' && (
                            <button className="sb-btn danger" onClick={() => handleVoid(r._id)}>Void</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>

      {showCreate && (
        <div className="sb-modal-bg" onClick={() => !saving && setShowCreate(false)}>
          <div className="sb-modal" onClick={e => e.stopPropagation()}>
            <div className="sb-modal-header">
              <h3 style={{ margin: 0, fontSize: 18 }}>New SC / PWD Entry</h3>
              <button onClick={() => !saving && setShowCreate(false)} className="sb-btn"><X size={16} /></button>
            </div>
            <div className="sb-modal-body">
              <div className="sb-form-row">
                <div>
                  <label className="sb-form-label">Type</label>
                  <select className="sb-form-input" value={draft.sc_pwd_type} onChange={e => setDraft({ ...draft, sc_pwd_type: e.target.value })}>
                    <option value="SC">Senior Citizen (RA 9994)</option>
                    <option value="PWD">PWD (RA 7277/9442)</option>
                  </select>
                </div>
                <div>
                  <label className="sb-form-label">{draft.sc_pwd_type === 'SC' ? 'OSCA' : 'PWD'} ID Number</label>
                  <input className="sb-form-input" value={draft.osca_or_pwd_id} onChange={e => setDraft({ ...draft, osca_or_pwd_id: e.target.value.toUpperCase() })} placeholder="e.g. ABC-12345" />
                </div>
              </div>
              <div className="sb-form-row">
                <div>
                  <label className="sb-form-label">Customer Name</label>
                  <input className="sb-form-input" value={draft.customer_name} onChange={e => setDraft({ ...draft, customer_name: e.target.value })} placeholder="Last name, First name" />
                </div>
                <div>
                  <label className="sb-form-label">Transaction Date</label>
                  <input className="sb-form-input" type="date" value={draft.transaction_date} onChange={e => setDraft({ ...draft, transaction_date: e.target.value })} />
                </div>
              </div>

              <label className="sb-form-label" style={{ marginTop: 8 }}>Line Items</label>
              <table className="sb-items-table">
                <thead>
                  <tr>
                    <th style={{ width: '50%' }}>Product</th>
                    <th style={{ width: '15%' }}>Qty</th>
                    <th style={{ width: '20%' }}>Unit Price</th>
                    <th style={{ width: '15%' }}>Line</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {draft.items.map((it, idx) => {
                    const lineSub = (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
                    return (
                      <tr key={idx}>
                        <td><input className="sb-form-input" value={it.product_name} onChange={e => {
                          const items = [...draft.items];
                          items[idx] = { ...items[idx], product_name: e.target.value };
                          setDraft({ ...draft, items });
                        }} placeholder="Brand + dosage (e.g. Biogesic 500mg)" /></td>
                        <td><input className="sb-form-input" type="number" min="0" step="1" value={it.qty} onChange={e => {
                          const items = [...draft.items];
                          items[idx] = { ...items[idx], qty: e.target.value };
                          setDraft({ ...draft, items });
                        }} /></td>
                        <td><input className="sb-form-input" type="number" min="0" step="0.01" value={it.unit_price} onChange={e => {
                          const items = [...draft.items];
                          items[idx] = { ...items[idx], unit_price: e.target.value };
                          setDraft({ ...draft, items });
                        }} /></td>
                        <td className="sb-money" style={{ textAlign: 'right' }}>₱{lineSub.toFixed(2)}</td>
                        <td>
                          {draft.items.length > 1 && (
                            <button className="sb-btn danger" type="button" onClick={() => {
                              const items = draft.items.filter((_, i) => i !== idx);
                              setDraft({ ...draft, items });
                            }}><X size={12} /></button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <button className="sb-btn" onClick={() => setDraft({ ...draft, items: [...draft.items, { product_name: '', qty: 1, unit_price: 0 }] })}>
                <Plus size={12} /> Add line
              </button>

              <div className="sb-totals-row" style={{ marginTop: 16 }}>
                <div className="sb-totals-cell">
                  <div className="sb-totals-label">Gross</div>
                  <div className="sb-totals-value sb-money">₱{draftTotals.gross.toFixed(2)}</div>
                </div>
                <div className="sb-totals-cell">
                  <div className="sb-totals-label">20% Discount</div>
                  <div className="sb-totals-value sb-money">₱{draftTotals.discount.toFixed(2)}</div>
                </div>
                <div className="sb-totals-cell">
                  <div className="sb-totals-label">VAT-Exempt</div>
                  <div className="sb-totals-value sb-money">₱{draftTotals.vatExempt.toFixed(2)}</div>
                </div>
                <div className="sb-totals-cell">
                  <div className="sb-totals-label">Net Receivable</div>
                  <div className="sb-totals-value sb-money">₱{draftTotals.net.toFixed(2)}</div>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <label className="sb-form-label">Notes</label>
                <textarea className="sb-form-input" rows={2} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} placeholder="Optional. Reference CSI / order number, supporting docs, etc." />
              </div>

              <div style={{ marginTop: 12, padding: 10, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#854d0e', display: 'flex', gap: 8 }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Math is auto-derived per RA 9994 (20% discount) + 12% VAT exemption on the discounted base. Per-line override available via API; UI exposes the normal customer-facing calc.</span>
              </div>
            </div>
            <div className="sb-modal-footer">
              <button className="sb-btn" onClick={() => setShowCreate(false)} disabled={saving}>Cancel</button>
              <button className="sb-btn primary" onClick={handleCreate} disabled={saving}>
                {saving ? <Loader size={14} className="sb-spin" /> : <Plus size={14} />} Create as DRAFT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
