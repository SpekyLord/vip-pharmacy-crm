import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { ROLES } from '../../constants/roles';
import useTransfers from '../hooks/useTransfers';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError } from '../utils/errorToast';

const pageStyles = `
  .receipt-page { background: var(--erp-bg, #f4f7fb); }
  .receipt-main { flex:1; min-width:0; overflow-y:auto; padding:24px; }
  .receipt-inner { max-width:900px; margin:0 auto; }
  .receipt-header h1 { font-size:22px; color:var(--erp-text, #132238); margin:0 0 20px; }

  .receipt-card { background:var(--erp-panel,#fff); border:1px solid var(--erp-border,#dbe4f0); border-radius:12px; padding:20px; margin-bottom:16px; }
  .receipt-card-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px; }
  .receipt-card-header h3 { margin:0; font-size:16px; }
  .receipt-meta { display:flex; gap:16px; font-size:13px; color:#64748b; flex-wrap:wrap; }

  .receipt-items { width:100%; border-collapse:collapse; font-size:13px; margin:12px 0; }
  .receipt-items th { padding:8px 10px; text-align:left; background:#f8f9fa; font-weight:600; border-bottom:1px solid #e2e8f0; }
  .receipt-items td { padding:8px 10px; border-bottom:1px solid #f1f5f9; }

  .badge { display:inline-block; padding:3px 10px; border-radius:999px; font-size:11px; font-weight:600; }
  .badge-shipped { background:#fed7aa; color:#9a3412; }
  .btn { padding:8px 16px; border:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; }
  .btn-success { background:#16a34a; color:#fff; }
  .btn-success:hover { opacity:0.9; }

  .empty-state { text-align:center; padding:60px 20px; color:#94a3b8; font-size:15px; }
  @media(max-width:768px) { .receipt-main { padding:16px; } }
`;

export default function TransferReceipt() {
  const { user } = useAuth();
  const { getTransfers, receiveTransfer, loading } = useTransfers();
  const [incoming, setIncoming] = useState([]);

  const fetchIncoming = useCallback(async () => {
    try {
      const res = await getTransfers({ status: 'SHIPPED', limit: 0 });
      // Filter to show only transfers targeting the user's entity
      const filtered = (res.data || []).filter(t =>
        t.target_entity_id?._id === user?.entity_id || [ROLES.PRESIDENT, ROLES.CEO, ROLES.ADMIN].includes(user?.role)
      );
      setIncoming(filtered);
    } catch (err) { console.error('[TransferReceipt] load error:', err.message); }
  }, [user]);

  useEffect(() => { fetchIncoming(); }, []);

  const handleReceive = async (id) => {
    try {
      await receiveTransfer(id);
      fetchIncoming();
    } catch (err) {
      showError(err, 'Could not receive transfer');
    }
  };

  return (
    <div className="receipt-page" style={{ display: 'flex', minHeight: '100vh' }}>
      <style>{pageStyles}</style>
      <Sidebar />
      <div className="receipt-main">
        <Navbar />
        <div className="receipt-inner">
          <WorkflowGuide pageKey="transfers-receive" />
          <div className="receipt-header">
            <h1>Incoming Transfers</h1>
          </div>

          {incoming.length === 0 && (
            <div className="empty-state">No incoming transfers awaiting receipt</div>
          )}

          {incoming.map(t => (
            <div className="receipt-card" key={t._id}>
              <div className="receipt-card-header">
                <h3>{t.transfer_ref}</h3>
                <span className="badge badge-shipped">SHIPPED</span>
              </div>
              <div className="receipt-meta">
                <span>From: <strong>{t.source_entity_id?.entity_name}</strong></span>
                <span>Date: {new Date(t.transfer_date).toLocaleDateString()}</span>
                <span>Items: {t.total_items}</span>
                <span>Value: ₱{(t.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>

              <table className="receipt-items">
                <thead>
                  <tr><th>Product</th><th>Batch</th><th>Qty</th><th>Price</th></tr>
                </thead>
                <tbody>
                  {(t.line_items || []).map((li, i) => (
                    <tr key={i}>
                      <td>{li.item_key || li.product_id}</td>
                      <td>{li.batch_lot_no || '—'}</td>
                      <td>{li.qty}</td>
                      <td>₱{(li.transfer_price || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <button className="btn btn-success" onClick={() => handleReceive(t._id)} disabled={loading}>
                {loading ? 'Processing...' : 'Confirm Receipt'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
