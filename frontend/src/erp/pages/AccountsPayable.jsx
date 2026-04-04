import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import usePurchasing from '../hooks/usePurchasing';

const styles = `
  .ap-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .ap-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1300px; margin: 0 auto; }
  .ap-header h2 { font-size: 20px; font-weight: 700; margin: 0 0 16px; }
  .ap-tabs { display: flex; gap: 4px; background: var(--erp-panel); border-radius: 8px; padding: 3px; margin-bottom: 16px; width: fit-content; flex-wrap: wrap; }
  .ap-tabs button { padding: 7px 16px; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; background: transparent; font-weight: 500; }
  .ap-tabs button.active { background: var(--erp-accent, #1e5eff); color: #fff; }
  .ap-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px; }
  .ap-card { background: var(--erp-panel, #fff); border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .ap-card-label { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--erp-muted, #64748b); font-weight: 600; margin-bottom: 4px; }
  .ap-card-value { font-size: 20px; font-weight: 700; }
  .ap-card-current { border-left: 4px solid #16a34a; }
  .ap-card-30 { border-left: 4px solid #f59e0b; }
  .ap-card-60 { border-left: 4px solid #ea580c; }
  .ap-card-90 { border-left: 4px solid #dc2626; }
  .ap-card-90p { border-left: 4px solid #7c3aed; }
  .ap-table { width: 100%; border-collapse: collapse; background: var(--erp-panel, #fff); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .ap-table th, .ap-table td { padding: 10px 12px; text-align: left; font-size: 13px; border-bottom: 1px solid var(--erp-border, #f1f5f9); }
  .ap-table th { background: var(--erp-accent-soft, #e8efff); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--erp-muted, #64748b); }
  .ap-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .ap-badge-overdue { background: #fee2e2; color: #dc2626; }
  .ap-badge-current { background: #dcfce7; color: #166534; }
  .ap-empty { text-align: center; color: #64748b; padding: 40px; }
  .ap-total-row td { font-weight: 700; background: var(--erp-accent-soft, #e8efff); }
  @media(max-width: 768px) { .ap-main { padding: 12px; } .ap-summary { grid-template-columns: 1fr 1fr; } }
`;

const TABS = [
  { key: 'ledger', label: 'AP Ledger' },
  { key: 'aging', label: 'AP Aging' },
  { key: 'consolidated', label: 'Consolidated' },
  { key: 'grni', label: 'GRNI' },
  { key: 'payments', label: 'Payment History' }
];

export default function AccountsPayable() {
  const api = usePurchasing();

  const [tab, setTab] = useState('ledger');
  const [loading, setLoading] = useState(false);
  const [ledger, setLedger] = useState([]);
  const [aging, setAging] = useState(null);
  const [consolidated, setConsolidated] = useState([]);
  const [grniData, setGrniData] = useState([]);
  const [payments, setPayments] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'ledger') {
        const res = await api.getApLedger();
        setLedger(res?.data || []);
      } else if (tab === 'aging') {
        const res = await api.getApAging();
        setAging(res?.data || null);
      } else if (tab === 'consolidated') {
        const res = await api.getApConsolidated();
        setConsolidated(res?.data || []);
      } else if (tab === 'grni') {
        const res = await api.getGrni();
        setGrniData(res?.data || []);
      } else if (tab === 'payments') {
        const res = await api.getPaymentHistory();
        setPayments(res?.data || []);
      }
    } catch { /* */ }
    setLoading(false);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const fmt = (n) => (n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  const renderLedger = () => {
    if (!ledger.length) return <div className="ap-empty">No outstanding AP</div>;
    const totalBalance = ledger.reduce((s, i) => s + i.balance, 0);
    return (
      <table className="ap-table">
        <thead>
          <tr><th>Vendor</th><th>Invoice Ref</th><th>Invoice Date</th><th>Due Date</th><th>Total</th><th>Paid</th><th>Balance</th><th>Days</th></tr>
        </thead>
        <tbody>
          {ledger.map(inv => (
            <tr key={inv._id}>
              <td style={{ fontWeight: 600 }}>{inv.vendor_name || '—'}</td>
              <td>{inv.invoice_ref}</td>
              <td>{fmtDate(inv.invoice_date)}</td>
              <td>{fmtDate(inv.due_date)}</td>
              <td>{fmt(inv.total_amount)}</td>
              <td>{fmt(inv.amount_paid)}</td>
              <td style={{ fontWeight: 600 }}>{fmt(inv.balance)}</td>
              <td><span className={`ap-badge ${inv.days_outstanding > 30 ? 'ap-badge-overdue' : 'ap-badge-current'}`}>{inv.days_outstanding}d</span></td>
            </tr>
          ))}
          <tr className="ap-total-row">
            <td colSpan={6} style={{ textAlign: 'right' }}>Total Outstanding:</td>
            <td>{fmt(totalBalance)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    );
  };

  const renderAging = () => {
    if (!aging) return <div className="ap-empty">No aging data</div>;
    const b = aging.buckets || {};
    return (
      <>
        <div className="ap-summary">
          <div className="ap-card ap-card-current"><div className="ap-card-label">Current</div><div className="ap-card-value">{fmt(b.current)}</div></div>
          <div className="ap-card ap-card-30"><div className="ap-card-label">1-30 Days</div><div className="ap-card-value">{fmt(b.days_1_30)}</div></div>
          <div className="ap-card ap-card-60"><div className="ap-card-label">31-60 Days</div><div className="ap-card-value">{fmt(b.days_31_60)}</div></div>
          <div className="ap-card ap-card-90"><div className="ap-card-label">61-90 Days</div><div className="ap-card-value">{fmt(b.days_61_90)}</div></div>
          <div className="ap-card ap-card-90p"><div className="ap-card-label">90+ Days</div><div className="ap-card-value">{fmt(b.days_90_plus)}</div></div>
        </div>
        <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
          Total Outstanding: {fmt(aging.total_outstanding)} ({aging.invoice_count} invoices)
        </div>
        {aging.vendor_breakdown?.length > 0 && (
          <table className="ap-table">
            <thead><tr><th>Vendor</th><th>Outstanding</th><th>Invoices</th></tr></thead>
            <tbody>
              {aging.vendor_breakdown.map((v) => (
                <tr key={v.vendor_name || v._id}>
                  <td style={{ fontWeight: 600 }}>{v.vendor_name || '—'}</td>
                  <td style={{ fontWeight: 600 }}>{fmt(v.total)}</td>
                  <td>{v.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </>
    );
  };

  const renderConsolidated = () => {
    if (!consolidated.length) return <div className="ap-empty">No outstanding AP</div>;
    return (
      <table className="ap-table">
        <thead><tr><th>Vendor</th><th>Outstanding</th><th>Invoices</th><th>Oldest</th><th>Newest</th></tr></thead>
        <tbody>
          {consolidated.map((v) => (
            <tr key={v.vendor_name || v._id}>
              <td style={{ fontWeight: 600 }}>{v.vendor_name || '—'}</td>
              <td style={{ fontWeight: 600 }}>{fmt(v.total_outstanding)}</td>
              <td>{v.invoice_count}</td>
              <td>{fmtDate(v.oldest_invoice)}</td>
              <td>{fmtDate(v.newest_invoice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const renderGrni = () => {
    if (!grniData.length) return <div className="ap-empty">No goods received not invoiced</div>;
    const totalValue = grniData.reduce((s, g) => s + g.estimated_value, 0);
    return (
      <table className="ap-table">
        <thead><tr><th>PO #</th><th>Vendor</th><th>Item</th><th>Received</th><th>Invoiced</th><th>Uninvoiced</th><th>Est. Value</th></tr></thead>
        <tbody>
          {grniData.map((g) => (
            <tr key={g._id || `${g.po_number}-${g.item_key}`}>
              <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{g.po_number}</td>
              <td>{g.vendor_name || '—'}</td>
              <td>{g.item_key || g.product_id}</td>
              <td>{g.qty_received}</td>
              <td>{g.qty_invoiced}</td>
              <td style={{ fontWeight: 600, color: '#dc2626' }}>{g.qty_uninvoiced}</td>
              <td style={{ fontWeight: 600 }}>{fmt(g.estimated_value)}</td>
            </tr>
          ))}
          <tr className="ap-total-row">
            <td colSpan={6} style={{ textAlign: 'right' }}>Total GRNI Value:</td>
            <td>{fmt(totalValue)}</td>
          </tr>
        </tbody>
      </table>
    );
  };

  const renderPayments = () => {
    if (!payments.length) return <div className="ap-empty">No payment history</div>;
    return (
      <table className="ap-table">
        <thead><tr><th>Date</th><th>Vendor</th><th>Invoice</th><th>Amount</th><th>Mode</th><th>Reference</th></tr></thead>
        <tbody>
          {payments.map(p => (
            <tr key={p._id}>
              <td>{fmtDate(p.payment_date)}</td>
              <td>{p.vendor_id?.vendor_name || '—'}</td>
              <td>{p.supplier_invoice_id?.invoice_ref || '—'}</td>
              <td style={{ fontWeight: 600 }}>{fmt(p.amount)}</td>
              <td>{p.payment_mode || '—'}</td>
              <td style={{ fontSize: 12 }}>{p.reference || p.check_no || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <>
      <style>{styles}</style>
      <div className="ap-page">
        <Navbar />
        <div style={{ display: 'flex' }}>
          <Sidebar />
          <main className="ap-main">
            <div className="ap-header"><h2>Accounts Payable</h2></div>

            <div className="ap-tabs">
              {TABS.map(t => (
                <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
              ))}
            </div>

            {loading ? <p>Loading...</p> : (
              <>
                {tab === 'ledger' && renderLedger()}
                {tab === 'aging' && renderAging()}
                {tab === 'consolidated' && renderConsolidated()}
                {tab === 'grni' && renderGrni()}
                {tab === 'payments' && renderPayments()}
              </>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
