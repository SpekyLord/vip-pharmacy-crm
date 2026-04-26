/**
 * PayoutLedgerPage — Phase VIP-1.B Phase 4
 *
 * Read-only ledger for both RebatePayout and CommissionPayout. Tabs switch
 * between the two collections. Status filter + period filter + payee filter.
 * Rebate ledger supports inline transitions ACCRUING → READY_TO_PAY → PAID
 * (gated by lookup-driven REBATE_ROLES.RUN_MONTHLY_CLOSE / MARK_PAID).
 *
 * Route: /admin/payout-ledger
 */
import { useState, useEffect, useCallback } from 'react';
import { Wallet, RefreshCw, AlertTriangle, Loader, CheckCircle2, XCircle, Coins } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import PageGuide from '../../components/common/PageGuide';
import rebateCommissionService from '../../erp/services/rebateCommissionService';

const TABS = [
  { key: 'REBATE', label: 'Rebate Payouts', icon: Coins },
  { key: 'COMMISSION', label: 'Commission Payouts', icon: Wallet },
];
const REBATE_STATUSES = ['', 'ACCRUING', 'READY_TO_PAY', 'PAID', 'VOIDED'];
const fmtMoney = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const STATUS_BG = { ACCRUING: '#fef3c7', READY_TO_PAY: '#dbeafe', PAID: '#dcfce7', VOIDED: '#f3f4f6' };
const STATUS_FG = { ACCRUING: '#b45309', READY_TO_PAY: '#1d4ed8', PAID: '#15803d', VOIDED: '#64748b' };

export default function PayoutLedgerPage() {
  const [tab, setTab] = useState('REBATE');
  const [status, setStatus] = useState('ACCRUING');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const params = {};
      if (status) params.status = status;
      if (period) params.period = period;
      if (tab === 'REBATE') {
        const [list, sum] = await Promise.all([
          rebateCommissionService.listRebatePayouts(params),
          rebateCommissionService.getRebatePayoutSummary({ period }),
        ]);
        setRows(list?.data || []);
        setSummary(sum || []);
      } else {
        const [list, sum] = await Promise.all([
          rebateCommissionService.listCommissionPayouts(params),
          rebateCommissionService.getCommissionPayoutSummary({ period }),
        ]);
        setRows(list?.data || []);
        setSummary(sum || []);
      }
    } catch (e) { setErr(e?.response?.data?.message || e.message); }
    finally { setLoading(false); }
  }, [tab, status, period]);

  useEffect(() => { load(); }, [load]);

  const transition = async (id, action) => {
    try {
      if (action === 'ready') await rebateCommissionService.markRebatePayoutReadyToPay(id);
      else if (action === 'paid') await rebateCommissionService.markRebatePayoutPaid(id);
      else if (action === 'void') {
        const reason = prompt('Reason for voiding?');
        if (!reason) return;
        await rebateCommissionService.voidRebatePayout(id, reason);
      }
      toast.success('Updated');
      load();
    } catch (e) { toast.error(e?.response?.data?.message || e.message); }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <main style={{ padding: 20, maxWidth: 1400, margin: '0 auto', width: '100%' }}>
          <PageGuide pageKey="payout-ledger" />

          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center' }}>
              <Wallet size={22} /> Payout Ledger
            </h1>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }} />
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}>
                {REBATE_STATUSES.map(s => <option key={s} value={s}>{s || 'All statuses'}</option>)}
              </select>
              <button onClick={load} style={{ padding: '8px 12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><RefreshCw size={14} /> Refresh</button>
            </div>
          </header>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
            {TABS.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '8px 16px', background: tab === t.key ? '#2563eb' : 'transparent', color: tab === t.key ? '#fff' : '#475569', border: 'none', cursor: 'pointer', borderRadius: '6px 6px 0 0', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon size={14} /> {t.label}
                </button>
              );
            })}
          </div>

          {/* Summary chips */}
          {summary.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {summary.map((s, i) => (
                <div key={i} style={{ padding: '8px 12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12 }}>
                  <span style={{ fontWeight: 600 }}>{s._id?.status || '—'}</span> · {s._id?.payee_kind || s._id?.payee_role || '—'} · <strong>{fmtMoney(s.total_amount)}</strong> ({s.count})
                </div>
              ))}
            </div>
          )}

          {err && <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 12, display: 'flex', gap: 8 }}><AlertTriangle size={16} />{err}</div>}

          {loading ? <div style={{ padding: 40, textAlign: 'center' }}><Loader className="animate-spin" size={20} /></div>
            : rows.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#64748b', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>No payouts in this period / status.</div>
            : (
              <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ background: '#f1f5f9' }}>
                    <tr>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Payee</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Source</th>
                      {tab === 'REBATE' && <th style={{ padding: '10px 12px', textAlign: 'left' }}>Product</th>}
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Amount</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Period</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Status</th>
                      {tab === 'REBATE' && <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r._id} style={{ borderTop: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '10px 12px' }}>
                          {r.payee
                            ? (r.payee.firstName ? `Dr. ${r.payee.firstName} ${r.payee.lastName}` : r.payee.name)
                            : <span style={{ color: '#94a3b8' }}>(missing)</span>}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 11, color: '#64748b' }}>{r.source_kind} · {r.collection_id ? `CR ${String(r.collection_id).slice(-6)}` : r.order_id ? `ORD ${String(r.order_id).slice(-6)}` : '—'}</td>
                        {tab === 'REBATE' && <td style={{ padding: '10px 12px' }}>{r.product_label || (r.product_id ? <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{String(r.product_id).slice(-6)}</span> : '—')}</td>}
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{fmtMoney(r.rebate_amount || r.commission_amount)}</td>
                        <td style={{ padding: '10px 12px' }}>{r.period}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: STATUS_BG[r.status] || '#f3f4f6', color: STATUS_FG[r.status] || '#64748b' }}>{r.status}</span>
                        </td>
                        {tab === 'REBATE' && (
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            {r.status === 'ACCRUING' && (
                              <button onClick={() => transition(r._id, 'ready')} style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, marginRight: 4 }}>
                                <CheckCircle2 size={12} /> Ready
                              </button>
                            )}
                            {r.status === 'READY_TO_PAY' && (
                              <button onClick={() => transition(r._id, 'paid')} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, marginRight: 4 }}>
                                <CheckCircle2 size={12} /> Paid
                              </button>
                            )}
                            {r.status !== 'VOIDED' && r.status !== 'PAID' && (
                              <button onClick={() => transition(r._id, 'void')} style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                                <XCircle size={12} /> Void
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </main>
      </div>
    </div>
  );
}
