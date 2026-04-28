/**
 * Hospital PO Detail — Phase CSI-X1 (Apr 2026)
 *
 * Single PO view with line-level qty_ordered / qty_served / qty_unserved,
 * status, and cancel actions (line + whole PO). Forward-compat: the
 * "Continue this PO" button (X2) creates a SalesEntry pre-linked to this PO.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getHospitalPo, cancelHospitalPo, cancelHospitalPoLine } from '../services/hospitalPoService';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError, showSuccess } from '../utils/errorToast';

const peso = (n) => '₱' + (Number(n || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS_COLORS = {
  OPEN: { bg: '#dbeafe', fg: '#1d4ed8' },
  PARTIAL: { bg: '#fef3c7', fg: '#b45309' },
  FULFILLED: { bg: '#dcfce7', fg: '#15803d' },
  CANCELLED: { bg: '#f3f4f6', fg: '#6b7280' },
  EXPIRED: { bg: '#fee2e2', fg: '#b91c1c' }
};

export default function HospitalPoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [po, setPo] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const result = await getHospitalPo(id);
      setPo(result);
    } catch (e) {
      showError(e, 'Could not load PO');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCancel = async () => {
    const reason = window.prompt('Reason for cancelling this PO:');
    if (reason === null) return;
    try {
      await cancelHospitalPo(id, reason);
      showSuccess('PO cancelled');
      await load();
    } catch (e) {
      showError(e, 'Could not cancel PO');
    }
  };

  const handleCancelLine = async (lineId) => {
    const reason = window.prompt('Reason for cancelling this line:');
    if (reason === null) return;
    try {
      await cancelHospitalPoLine(lineId, reason);
      showSuccess('Line cancelled');
      await load();
    } catch (e) {
      showError(e, 'Could not cancel line');
    }
  };

  const handleContinueWithCsi = () => {
    // X2 will pre-fill SalesEntry with po_id + line items. For X1, navigate
    // to SalesEntry with the PO# in query string so the encoder types it
    // by hand. The X2 sprint will wire deep-link auto-fill.
    navigate(`/erp/sales/entry?po_id=${id}&hospital_id=${po?.hospital_id?._id || ''}`);
  };

  if (loading) return <div style={{ padding: 20 }}>Loading…</div>;
  if (!po) return <div style={{ padding: 20 }}>PO not found.</div>;

  const c = STATUS_COLORS[po.status] || STATUS_COLORS.OPEN;
  const unserved = (po.total_amount_ordered || 0) - (po.total_amount_served || 0);
  const canCancel = po.status === 'OPEN' || po.status === 'PARTIAL';

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <button onClick={() => navigate('/erp/hospital-pos/backlog')}
              style={{ background: 'transparent', border: 'none', color: '#2563eb', cursor: 'pointer', marginBottom: 8, padding: 0 }}>
        ← Back to Backlog
      </button>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontFamily: 'monospace' }}>PO #{po.po_number}</h2>
        <span style={{ padding: '4px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, background: c.bg, color: c.fg }}>
          {po.status}
        </span>
      </div>
      <div style={{ color: '#64748b', marginBottom: 16, fontSize: 13 }}>
        {po.hospital_id?.hospital_name} · BDM: {po.bdm_id?.name || '—'}
        {po.recorded_on_behalf_of ? ` · entered by ${po.entered_by?.name || 'proxy'}` : ''}
      </div>

      <WorkflowGuide pageKey="hospital-po-detail" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <Tile label="Total Ordered" value={peso(po.total_amount_ordered)} />
        <Tile label="Total Served" value={peso(po.total_amount_served)} color="#15803d" />
        <Tile label="Total Unserved" value={peso(unserved)} color="#b45309" />
        <Tile label="PO Date" value={po.po_date ? new Date(po.po_date).toLocaleDateString() : '—'} />
        <Tile label="Expires" value={po.expiry_date ? new Date(po.expiry_date).toLocaleDateString() : '—'} />
      </div>

      <h3 style={{ fontSize: 14, marginBottom: 8 }}>Line Items</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff' }}>
        <thead style={{ background: '#f1f5f9' }}>
          <tr>
            <th style={{ padding: 10, textAlign: 'left' }}>Product</th>
            <th style={{ padding: 10, textAlign: 'right' }}>Ordered</th>
            <th style={{ padding: 10, textAlign: 'right' }}>Served</th>
            <th style={{ padding: 10, textAlign: 'right' }}>Unserved</th>
            <th style={{ padding: 10, textAlign: 'right' }}>Unit ₱</th>
            <th style={{ padding: 10, textAlign: 'left' }}>Price Src</th>
            <th style={{ padding: 10, textAlign: 'left' }}>Status</th>
            <th style={{ padding: 10 }}></th>
          </tr>
        </thead>
        <tbody>
          {(po.lines || []).map(ln => {
            const sc = STATUS_COLORS[ln.status] || STATUS_COLORS.OPEN;
            return (
              <tr key={ln._id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: 10 }}>
                  {ln.product_id?.brand_name || '—'} {ln.product_id?.dosage_strength || ''}
                  {ln.product_id?.generic_name && (
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{ln.product_id.generic_name}</div>
                  )}
                </td>
                <td style={{ padding: 10, textAlign: 'right' }}>{ln.qty_ordered}</td>
                <td style={{ padding: 10, textAlign: 'right', color: '#15803d' }}>{ln.qty_served}</td>
                <td style={{ padding: 10, textAlign: 'right', fontWeight: 600, color: ln.qty_unserved > 0 ? '#b45309' : '#94a3b8' }}>{ln.qty_unserved}</td>
                <td style={{ padding: 10, textAlign: 'right' }}>{peso(ln.unit_price)}</td>
                <td style={{ padding: 10, fontSize: 11, color: ln.price_source === 'CONTRACT' ? '#15803d' : '#64748b' }}>{ln.price_source}</td>
                <td style={{ padding: 10 }}>
                  <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: sc.bg, color: sc.fg }}>
                    {ln.status}
                  </span>
                </td>
                <td style={{ padding: 10, textAlign: 'right' }}>
                  {(ln.status === 'OPEN' || ln.status === 'PARTIAL') && (
                    <button onClick={() => handleCancelLine(ln._id)}
                            style={{ background: 'transparent', color: '#dc2626', border: '1px solid #fca5a5', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {po.source_text && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Source Text ({po.source_kind || 'OTHER'})</div>
          <pre style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 12, fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
            {po.source_text}
          </pre>
        </div>
      )}

      <div style={{ marginTop: 24, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {canCancel && (
          <button onClick={handleCancel}
                  style={{ background: 'transparent', color: '#dc2626', border: '1px solid #fca5a5', padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}>
            Cancel This PO
          </button>
        )}
        {(po.status === 'OPEN' || po.status === 'PARTIAL') && (
          <button onClick={handleContinueWithCsi}
                  style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
            Continue with CSI →
          </button>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, color = '#1e40af' }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}
