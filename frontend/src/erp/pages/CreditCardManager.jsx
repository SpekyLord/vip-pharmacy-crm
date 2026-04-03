import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useAccounting from '../hooks/useAccounting';
import userService from '../../services/userService';

const pageStyles = `
  .ccm-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .ccm-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .ccm-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .ccm-header h2 { font-size: 20px; font-weight: 700; margin: 0; }
  .ccm-tabs { display: flex; gap: 4px; background: var(--erp-panel); border-radius: 8px; padding: 3px; margin-bottom: 14px; width: fit-content; }
  .ccm-tabs button { padding: 6px 14px; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; background: transparent; }
  .ccm-tabs button.active { background: var(--erp-accent); color: #fff; }
  .btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-danger { background: #dc2626; color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 12px; }
  .ccm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; }
  .ccm-card { background: var(--erp-panel); border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06); border-left: 4px solid var(--erp-accent); }
  .ccm-card.fleet { border-left-color: #f59e0b; }
  .ccm-card.inactive { opacity: 0.5; border-left-color: #9ca3af; }
  .ccm-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
  .ccm-card-title { font-size: 15px; font-weight: 700; }
  .ccm-card-code { font-size: 11px; font-family: monospace; color: var(--erp-muted); }
  .ccm-card-row { display: flex; justify-content: space-between; font-size: 13px; padding: 2px 0; }
  .ccm-card-row .label { color: var(--erp-muted); }
  .ccm-card-row .value { font-weight: 500; }
  .ccm-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; }
  .ccm-badge-cc { background: #dbeafe; color: #1e40af; }
  .ccm-badge-fleet { background: #fef3c7; color: #92400e; }
  .ccm-badge-debit { background: #e0e7ff; color: #3730a3; }
  .ccm-assigned { margin-top: 8px; padding: 8px 10px; background: var(--erp-accent-soft, #e8efff); border-radius: 8px; font-size: 12px; }
  .ccm-assigned .name { font-weight: 600; }
  .ccm-actions { display: flex; gap: 6px; margin-top: 10px; }
  .ccm-modal { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .ccm-modal-body { background: var(--erp-panel, #fff); border-radius: 12px; padding: 24px; width: 500px; max-width: 95vw; max-height: 90vh; overflow-y: auto; }
  .ccm-modal-body h3 { margin: 0 0 16px; font-size: 16px; }
  .form-group { margin-bottom: 12px; }
  .form-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: var(--erp-muted); }
  .form-group input, .form-group select { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; box-sizing: border-box; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .ccm-empty { text-align: center; color: #64748b; padding: 40px; }
  .ccm-msg { font-size: 13px; margin-bottom: 12px; padding: 8px 12px; border-radius: 8px; }
  .ccm-msg-ok { background: #dcfce7; color: #166534; }
  .ccm-msg-err { background: #fee2e2; color: #dc2626; }
  @media(max-width: 768px) { .ccm-main { padding: 12px; } .ccm-grid { grid-template-columns: 1fr; } .form-row { grid-template-columns: 1fr; } }
`;

const TYPE_BADGES = { CREDIT_CARD: 'ccm-badge-cc', FLEET_CARD: 'ccm-badge-fleet', DEBIT_CARD: 'ccm-badge-debit' };
const CARD_TYPES = ['CREDIT_CARD', 'FLEET_CARD', 'DEBIT_CARD'];
const CARD_BRANDS = ['VISA', 'MASTERCARD', 'JCB', 'AMEX', 'FLEET'];

const EMPTY_FORM = {
  card_code: '', card_name: '', card_holder: '', bank: '',
  card_type: 'CREDIT_CARD', card_brand: 'MASTERCARD',
  last_four: '', coa_code: '2301', credit_limit: '',
  statement_cycle_day: '', assigned_to: '', is_active: true
};

export default function CreditCardManager() {
  const { user } = useAuth();
  const api = useAccounting();

  const [cards, setCards] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [msg, setMsg] = useState({ text: '', type: '' });

  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (tab === 'credit') params.card_type = 'CREDIT_CARD';
      if (tab === 'fleet') params.card_type = 'FLEET_CARD';
      const res = await api.listCreditCards(params);
      setCards(res?.data || []);
    } catch { /* */ }
    setLoading(false);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadUsers = useCallback(async () => {
    try {
      const res = await userService.getActiveUsers();
      setUsers(res?.data || res || []);
    } catch { /* */ }
  }, []);

  useEffect(() => { loadCards(); }, [loadCards]);
  useEffect(() => { loadUsers(); }, [loadUsers]);

  const showMsg = (text, type = 'ok') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  };

  const openEdit = (card) => {
    setEditing(card);
    setForm({
      card_code: card.card_code || '',
      card_name: card.card_name || '',
      card_holder: card.card_holder || '',
      bank: card.bank || '',
      card_type: card.card_type || 'CREDIT_CARD',
      card_brand: card.card_brand || 'MASTERCARD',
      last_four: card.last_four || '',
      coa_code: card.coa_code || '2301',
      credit_limit: card.credit_limit || '',
      statement_cycle_day: card.statement_cycle_day || '',
      assigned_to: card.assigned_to?._id || card.assigned_to || '',
      is_active: card.is_active !== false
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    const data = {
      ...form,
      credit_limit: parseFloat(form.credit_limit) || 0,
      statement_cycle_day: parseInt(form.statement_cycle_day) || undefined,
      assigned_to: form.assigned_to || undefined
    };
    try {
      if (editing) {
        await api.updateCreditCard(editing._id, data);
        showMsg('Card updated');
      } else {
        await api.createCreditCard(data);
        showMsg('Card created');
      }
      setShowModal(false);
      loadCards();
    } catch (err) {
      showMsg(err?.response?.data?.message || 'Error saving card', 'err');
    }
  };

  const handleDeactivate = async (card) => {
    if (!confirm(`Deactivate ${card.card_name}?`)) return;
    try {
      await api.updateCreditCard(card._id, { is_active: false });
      showMsg('Card deactivated');
      loadCards();
    } catch { showMsg('Error', 'err'); }
  };

  const handleActivate = async (card) => {
    try {
      await api.updateCreditCard(card._id, { is_active: true });
      showMsg('Card reactivated');
      loadCards();
    } catch { showMsg('Error', 'err'); }
  };

  const f = (field, value) => setForm(p => ({ ...p, [field]: value }));

  return (
    <div className="ccm-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main className="ccm-main admin-main">
          <div className="ccm-header">
            <h2>Credit Card Management</h2>
            <button className="btn btn-primary" onClick={openCreate}>+ Add Card</button>
          </div>

          {msg.text && <div className={`ccm-msg ccm-msg-${msg.type}`}>{msg.text}</div>}

          <div className="ccm-tabs">
            {[['all', 'All'], ['credit', 'Credit Cards'], ['fleet', 'Fleet Cards']].map(([key, label]) => (
              <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>
            ))}
          </div>

          {loading ? <div className="ccm-empty">Loading...</div> : cards.length === 0 ? <div className="ccm-empty">No cards found</div> : (
            <div className="ccm-grid">
              {cards.map(card => (
                <div key={card._id} className={`ccm-card ${card.card_type === 'FLEET_CARD' ? 'fleet' : ''} ${!card.is_active ? 'inactive' : ''}`}>
                  <div className="ccm-card-header">
                    <div>
                      <div className="ccm-card-title">{card.card_name}</div>
                      <div className="ccm-card-code">{card.card_code}</div>
                    </div>
                    <span className={`ccm-badge ${TYPE_BADGES[card.card_type] || ''}`}>{card.card_type?.replace('_', ' ')}</span>
                  </div>
                  <div className="ccm-card-row"><span className="label">Bank</span><span className="value">{card.bank || '—'}</span></div>
                  <div className="ccm-card-row"><span className="label">Brand</span><span className="value">{card.card_brand || '—'}</span></div>
                  <div className="ccm-card-row"><span className="label">Last 4</span><span className="value">{card.last_four ? `•••• ${card.last_four}` : '—'}</span></div>
                  <div className="ccm-card-row"><span className="label">COA Code</span><span className="value" style={{ fontFamily: 'monospace' }}>{card.coa_code}</span></div>
                  {card.credit_limit > 0 && <div className="ccm-card-row"><span className="label">Limit</span><span className="value">₱{Number(card.credit_limit).toLocaleString()}</span></div>}
                  {!card.is_active && <div style={{ color: '#dc2626', fontSize: 12, fontWeight: 600, marginTop: 4 }}>INACTIVE</div>}

                  {card.assigned_to && (
                    <div className="ccm-assigned">
                      Assigned to: <span className="name">{card.assigned_to.name || card.assigned_to.email || '—'}</span>
                      {card.assigned_at && <span style={{ marginLeft: 8, color: 'var(--erp-muted)' }}>since {new Date(card.assigned_at).toLocaleDateString()}</span>}
                    </div>
                  )}
                  {!card.assigned_to && <div className="ccm-assigned" style={{ background: '#fef3c7' }}>Not assigned</div>}

                  <div className="ccm-actions">
                    <button className="btn btn-sm btn-primary" onClick={() => openEdit(card)}>Edit</button>
                    {card.is_active
                      ? <button className="btn btn-sm btn-danger" onClick={() => handleDeactivate(card)}>Deactivate</button>
                      : <button className="btn btn-sm btn-success" onClick={() => handleActivate(card)}>Reactivate</button>
                    }
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Create / Edit Modal */}
          {showModal && (
            <div className="ccm-modal" onClick={() => setShowModal(false)}>
              <div className="ccm-modal-body" onClick={e => e.stopPropagation()}>
                <h3>{editing ? 'Edit Card' : 'Add New Card'}</h3>

                <div className="form-row">
                  <div className="form-group">
                    <label>Card Code</label>
                    <input value={form.card_code} onChange={e => f('card_code', e.target.value)} placeholder="e.g. SBC-MC-002" disabled={!!editing} />
                  </div>
                  <div className="form-group">
                    <label>Card Name</label>
                    <input value={form.card_name} onChange={e => f('card_name', e.target.value)} placeholder="e.g. SBC Mastercard" />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Bank</label>
                    <input value={form.bank} onChange={e => f('bank', e.target.value)} placeholder="Security Bank" />
                  </div>
                  <div className="form-group">
                    <label>Card Holder</label>
                    <input value={form.card_holder} onChange={e => f('card_holder', e.target.value)} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Card Type</label>
                    <select value={form.card_type} onChange={e => f('card_type', e.target.value)}>
                      {CARD_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Card Brand</label>
                    <select value={form.card_brand} onChange={e => f('card_brand', e.target.value)}>
                      {CARD_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Last 4 Digits</label>
                    <input value={form.last_four} onChange={e => f('last_four', e.target.value)} maxLength={4} placeholder="1234" />
                  </div>
                  <div className="form-group">
                    <label>COA Code</label>
                    <input value={form.coa_code} onChange={e => f('coa_code', e.target.value)} placeholder="2301" />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Credit Limit (₱)</label>
                    <input type="number" value={form.credit_limit} onChange={e => f('credit_limit', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Statement Cycle Day</label>
                    <input type="number" min={1} max={31} value={form.statement_cycle_day} onChange={e => f('statement_cycle_day', e.target.value)} />
                  </div>
                </div>

                <div className="form-group">
                  <label>Assign To</label>
                  <select value={form.assigned_to} onChange={e => f('assigned_to', e.target.value)}>
                    <option value="">Not assigned</option>
                    {users.map(u => <option key={u._id} value={u._id}>{u.name} ({u.email})</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>
                    <input type="checkbox" checked={form.is_active} onChange={e => f('is_active', e.target.checked)} style={{ width: 'auto', marginRight: 6 }} />
                    Active
                  </label>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSave}>{editing ? 'Update' : 'Create'}</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
