import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useTransfers from '../hooks/useTransfers';

import SelectField from '../../components/common/Select';

const pageStyles = `
  .tpm-page { background: var(--erp-bg, #f4f7fb); }
  .tpm-main { flex:1; min-width:0; overflow-y:auto; padding:24px; }
  .tpm-inner { max-width:1000px; margin:0 auto; }
  .tpm-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:12px; }
  .tpm-header h1 { font-size:22px; margin:0; color:var(--erp-text,#132238); }

  .filter-row { display:flex; gap:10px; margin-bottom:20px; flex-wrap:wrap; }
  .filter-row select { padding:8px 12px; border:1px solid var(--erp-border,#dbe4f0); border-radius:8px; font-size:13px; background:var(--erp-panel,#fff); height:38px; }

  .price-table { width:100%; border-collapse:collapse; font-size:13px; background:var(--erp-panel,#fff); border:1px solid var(--erp-border); border-radius:12px; overflow:hidden; }
  .price-table th { background:var(--erp-accent-soft,#e8efff); padding:10px 14px; text-align:left; font-weight:600; }
  .price-table td { padding:10px 14px; border-top:1px solid var(--erp-border); }
  .price-table input { width:90px; padding:4px 8px; border:1px solid #dbe4f0; border-radius:6px; font-size:13px; text-align:right; }

  .btn { padding:8px 16px; border:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; }
  .btn-primary { background:var(--erp-accent,#1e5eff); color:#fff; }
  .btn-sm { padding:4px 10px; font-size:11px; }
  .btn-success { background:#16a34a; color:#fff; }
  .save-msg { color:#16a34a; font-size:12px; margin-left:8px; }

  .empty-state { text-align:center; padding:60px 20px; color:#94a3b8; }

  @media(max-width:768px) { .tpm-main { padding:16px; } .price-table { font-size:11px; } }
`;

export function TransferPriceManagerContent() {
  const { user } = useAuth();
  const { getTransferPrices, setTransferPrice, getEntities, loading } = useTransfers();

  const [entities, setEntities] = useState([]);
  const [prices, setPrices] = useState([]);
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editPrice, setEditPrice] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  const fetchEntities = useCallback(async () => {
    try {
      const res = await getEntities();
      setEntities(res.data || []);
    } catch { /* */ }
  }, []);

  const fetchPrices = useCallback(async () => {
    if (!sourceId || !targetId) return;
    try {
      const res = await getTransferPrices({ source_entity_id: sourceId, target_entity_id: targetId });
      setPrices(res.data || []);
    } catch { /* */ }
  }, [sourceId, targetId]);

  useEffect(() => { fetchEntities(); }, []);
  useEffect(() => { fetchPrices(); }, [sourceId, targetId]);

  const handleSave = async (p) => {
    try {
      await setTransferPrice({
        source_entity_id: sourceId,
        target_entity_id: targetId,
        product_id: p.product_id?._id || p.product_id,
        transfer_price: parseFloat(editPrice)
      });
      setEditingId(null);
      setSavedMsg('Saved!');
      setTimeout(() => setSavedMsg(''), 2000);
      fetchPrices();
    } catch { /* */ }
  };

  const isPresidentOrAdmin = ['president', 'ceo', 'admin'].includes(user?.role);

  return (
    <>
      <style>{pageStyles}</style>
      <div className="tpm-inner">
        <div className="tpm-header">
          <h1>Transfer Price Manager</h1>
          {savedMsg && <span className="save-msg">{savedMsg}</span>}
        </div>

        <div className="filter-row">
          <SelectField value={sourceId} onChange={e => setSourceId(e.target.value)}>
            <option value="">Source Entity...</option>
            {entities.map(e => <option key={e._id} value={e._id}>{e.entity_name}</option>)}
          </SelectField>
          <SelectField value={targetId} onChange={e => setTargetId(e.target.value)}>
            <option value="">Target Entity...</option>
            {entities.filter(e => e._id !== sourceId).map(e => <option key={e._id} value={e._id}>{e.entity_name}</option>)}
          </SelectField>
        </div>

        {(!sourceId || !targetId) ? (
          <div className="empty-state">Select source and target entities to manage transfer prices</div>
        ) : prices.length === 0 ? (
          <div className="empty-state">No transfer prices configured for this entity pair</div>
        ) : (
          <table className="price-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Generic Name</th>
                <th>Selling Price</th>
                <th>Transfer Price</th>
                <th>Effective</th>
                <th>Set By</th>
                {isPresidentOrAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {prices.map(p => {
                const pid = p._id;
                const isEditing = editingId === pid;
                return (
                  <tr key={pid}>
                    <td style={{ fontWeight: 600 }}>{p.product_id?.brand_name || '—'}</td>
                    <td>{p.product_id?.generic_name || '—'}</td>
                    <td>₱{(p.product_id?.selling_price || 0).toLocaleString()}</td>
                    <td>
                      {isEditing ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editPrice}
                          onChange={e => setEditPrice(e.target.value)}
                          autoFocus
                        />
                      ) : (
                        <span>₱{(p.transfer_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      )}
                    </td>
                    <td>{new Date(p.effective_date).toLocaleDateString()}</td>
                    <td>{p.set_by?.name || '—'}</td>
                    {isPresidentOrAdmin && (
                      <td>
                        {isEditing ? (
                          <>
                            <button className="btn btn-sm btn-success" onClick={() => handleSave(p)} disabled={loading}>Save</button>
                            <button className="btn btn-sm" style={{ marginLeft: 4, background: '#e2e8f0' }} onClick={() => setEditingId(null)}>×</button>
                          </>
                        ) : (
                          <button className="btn btn-sm btn-primary" onClick={() => { setEditingId(pid); setEditPrice(p.transfer_price); }}>Edit</button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export default function TransferPriceManager() {
  return (
    <div className="tpm-page" style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="tpm-main">
        <Navbar />
        <TransferPriceManagerContent />
      </div>
    </div>
  );
}
