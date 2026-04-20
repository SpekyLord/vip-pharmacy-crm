/**
 * GrnAuditView — Phase 32
 *
 * Audit trail for a single GRN: renders 3 stacked panels (GRN metadata,
 * Undertaking capture state, InventoryLedger cross-links per batch). The
 * Undertaking is 1:1 with GRN (enforced by the partial unique index on
 * linked_grn_id), so we fetch the Undertaking that points at this GRN and
 * use its populated `linked_grn_id` as the GRN panel data.
 *
 * Route: /erp/grn/:id/audit
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import WorkflowGuide from '../components/WorkflowGuide';
import { listUndertakings } from '../services/undertakingService';
import { showError } from '../utils/errorToast';

const SOURCE_LABELS = {
  PO: 'Purchase Order',
  INTERNAL_TRANSFER: 'Internal Transfer',
  STANDALONE: 'Standalone',
};

const STATUS_COLORS = {
  DRAFT:        { bg: '#e5e7eb', fg: '#374151' },
  PENDING:      { bg: '#fef3c7', fg: '#854d0e' },
  SUBMITTED:    { bg: '#fef3c7', fg: '#92400e' },
  APPROVED:     { bg: '#dcfce7', fg: '#166534' },
  ACKNOWLEDGED: { bg: '#dcfce7', fg: '#166534' },
  REJECTED:     { bg: '#fee2e2', fg: '#991b1b' },
};

function chip(text, colorObj) {
  const c = colorObj || { bg: '#e5e7eb', fg: '#374151' };
  return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, background: c.bg, color: c.fg, fontSize: 11, fontWeight: 700 }}>{text}</span>;
}

export default function GrnAuditView() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [undertaking, setUndertaking] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        // Undertaking is 1:1 with GRN (partial unique index)
        const res = await listUndertakings({ linked_grn_id: id, limit: 1 });
        const row = res?.data?.[0];
        if (cancelled) return;
        if (!row) {
          setError('No Undertaking found for this GRN. Older GRNs may not have one — run the backfill script.');
          return;
        }
        // Fetch the full detail so we get product-populated line_items
        const { getUndertakingById } = await import('../services/undertakingService');
        const full = await getUndertakingById(row._id);
        if (cancelled) return;
        setUndertaking(full?.data || row);
      } catch (err) {
        if (!cancelled) showError(err, 'Failed to load GRN audit trail');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="admin-page erp-page">
        <Navbar />
        <div className="admin-layout">
          <Sidebar />
          <main className="admin-main" style={{ padding: 24 }}>Loading audit trail…</main>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-page erp-page">
        <Navbar />
        <div className="admin-layout">
          <Sidebar />
          <main className="admin-main" style={{ padding: 24 }}>
            <Link to="/erp/grn" style={{ color: '#2563eb' }}>← GRN List</Link>
            <div style={{ marginTop: 12, padding: 14, background: '#fef3c7', color: '#92400e', borderRadius: 10 }}>{error}</div>
          </main>
        </div>
      </div>
    );
  }

  if (!undertaking) return null;

  const grn = undertaking.linked_grn_id && typeof undertaking.linked_grn_id === 'object' ? undertaking.linked_grn_id : null;
  const totalLines = undertaking.line_items?.length || 0;
  const scanned = (undertaking.line_items || []).filter(l => l.scan_confirmed).length;
  const variances = (undertaking.line_items || []).filter(l => l.variance_flag).length;

  return (
    <div className="admin-page erp-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main ga-main">
          <WorkflowGuide pageKey="grn-audit" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <Link to="/erp/grn" style={{ fontSize: 13, color: '#2563eb' }}>← GRN List</Link>
              <h1 style={{ margin: '6px 0 0', fontSize: 22 }}>GRN Audit Trail</h1>
            </div>
            <Link to={`/erp/undertaking/${undertaking._id}`} className="btn btn-primary">Open Undertaking →</Link>
          </div>

          {/* ── GRN Panel ── */}
          <section className="ga-panel">
            <header className="ga-panel-head">
              <div>
                <h2>GRN</h2>
                <div className="ga-sub">
                  {grn ? (
                    <>
                      {/* Phase 32R-GRN#: prefer human-readable grn_number, then PO#, then id-tail for legacy rows */}
                      {grn.grn_number || grn.po_number || (grn._id ? grn._id.slice(-6) : '—')} · {SOURCE_LABELS[grn.source_type] || 'STANDALONE'}
                      {grn.vendor_id?.vendor_name && <> · {grn.vendor_id.vendor_name}</>}
                    </>
                  ) : '—'}
                </div>
              </div>
              {grn?.status && chip(grn.status, STATUS_COLORS[grn.status])}
            </header>
            <div className="ga-grid">
              <div>
                <div className="ga-label">GRN#</div>
                <div style={{ fontFamily: 'monospace' }}>{grn?.grn_number || '—'}</div>
              </div>
              <div>
                <div className="ga-label">GRN Date</div>
                <div>{grn?.grn_date ? new Date(grn.grn_date).toLocaleDateString('en-PH') : '—'}</div>
              </div>
              <div>
                <div className="ga-label">Source</div>
                <div>{SOURCE_LABELS[grn?.source_type] || '—'}</div>
              </div>
              <div>
                <div className="ga-label">PO#</div>
                <div style={{ fontFamily: 'monospace' }}>{grn?.po_number || '—'}</div>
              </div>
            </div>
            {grn?.waybill_photo_url && (
              <div style={{ marginTop: 10 }}>
                <div className="ga-label">Waybill</div>
                <a href={grn.waybill_photo_url} target="_blank" rel="noreferrer">
                  <img src={grn.waybill_photo_url} alt="Waybill" className="ga-thumb" />
                </a>
              </div>
            )}
          </section>

          {/* ── Undertaking Panel ── */}
          <section className="ga-panel">
            <header className="ga-panel-head">
              <div>
                <h2>Undertaking</h2>
                <div className="ga-sub">
                  {undertaking.undertaking_number} · {scanned}/{totalLines} scanned · {variances} variance{variances === 1 ? '' : 's'}
                </div>
              </div>
              {chip(undertaking.status, STATUS_COLORS[undertaking.status])}
            </header>
            <div className="ga-grid">
              <div>
                <div className="ga-label">Receipt Date</div>
                <div>{undertaking.receipt_date ? new Date(undertaking.receipt_date).toLocaleDateString('en-PH') : '—'}</div>
              </div>
              <div>
                <div className="ga-label">BDM</div>
                <div>{undertaking.bdm_id?.name || '—'}</div>
              </div>
              <div>
                <div className="ga-label">Acknowledged By</div>
                <div>{undertaking.acknowledged_by?.name || '—'}{undertaking.acknowledged_at ? ` · ${new Date(undertaking.acknowledged_at).toLocaleString()}` : ''}</div>
              </div>
            </div>
            {undertaking.rejection_reason && (
              <div style={{ padding: 10, background: '#fef2f2', color: '#991b1b', borderRadius: 8, marginTop: 10, fontSize: 13 }}>
                <strong>Rejection reason (reopened {undertaking.reopen_count || 0}×):</strong> {undertaking.rejection_reason}
              </div>
            )}
          </section>

          {/* ── Line Items + per-batch batch-trace cross-link ── */}
          <section className="ga-panel">
            <header className="ga-panel-head">
              <h2>Line Items & Batch Trace</h2>
            </header>
            <table className="ga-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Batch</th>
                  <th>Expiry</th>
                  <th>Qty</th>
                  <th>Scan</th>
                  <th>Variance</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(undertaking.line_items || []).map((li, i) => {
                  const p = li.product_id && typeof li.product_id === 'object' ? li.product_id : null;
                  const label = p ? `${p.brand_name || ''} ${p.dosage_strength || ''}`.trim() : (li.item_key || '—');
                  const pid = p?._id || li.product_id;
                  const traceHref = pid && li.batch_lot_no
                    ? `/erp/batch-trace?product=${pid}&batch=${encodeURIComponent(li.batch_lot_no)}`
                    : null;
                  return (
                    <tr key={i}>
                      <td>{label}{p?.unit_code ? ` — ${p.unit_code}` : ''}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{li.batch_lot_no || '—'}</td>
                      <td style={{ fontSize: 12 }}>{li.expiry_date ? new Date(li.expiry_date).toLocaleDateString('en-PH') : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{li.received_qty ?? li.qty ?? '—'}</td>
                      <td style={{ textAlign: 'center', fontSize: 12 }}>{li.scan_confirmed ? '✓' : '—'}</td>
                      <td style={{ textAlign: 'center', fontSize: 11 }}>
                        {li.variance_flag
                          ? <span style={{ padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>{li.variance_flag}</span>
                          : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {traceHref && <Link to={traceHref} style={{ color: '#2563eb', fontSize: 12 }}>Trace →</Link>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </main>
      </div>
    </div>
  );
}

const pageStyles = `
  .ga-main { flex: 1; min-width: 0; overflow-y: auto; padding: 24px; max-width: 1100px; margin: 0 auto; }
  .ga-panel { background: #fff; border: 1px solid #dbe4f0; border-radius: 12px; padding: 18px; margin-bottom: 14px; }
  .ga-panel-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 10px; flex-wrap: wrap; }
  .ga-panel-head h2 { margin: 0; font-size: 16px; color: #132238; }
  .ga-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
  .ga-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .ga-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8; font-weight: 700; margin-bottom: 2px; }
  .ga-thumb { max-width: 140px; max-height: 100px; border-radius: 8px; border: 1px solid #dbe4f0; margin-top: 4px; }
  .ga-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .ga-table th { background: #f8fafc; padding: 8px 10px; text-align: left; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
  .ga-table td { padding: 8px 10px; border-top: 1px solid #eef2f7; }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; text-decoration: none; display: inline-block; }
  .btn-primary { background: #2563eb; color: #fff; }
  @media (max-width: 640px) {
    .ga-main { padding: 76px 12px 96px; }
    .ga-grid { grid-template-columns: 1fr; }
    .ga-table th:nth-child(4), .ga-table td:nth-child(4) { display: none; }
    .ga-table th:nth-child(5), .ga-table td:nth-child(5) { display: none; }
  }
`;
