/**
 * CreditRuleManager — Phase SG-4 #22
 *
 * Admin page (admin/finance/president) for the SAP-Commissions-pattern
 * credit-rule engine. Each rule says "for sales matching THESE conditions,
 * give THIS BDM THIS percentage of credit." Rules apply on every SalesLine
 * post via creditRuleEngine.assign(). When no rule matches, fallback gives
 * 100% to sale.bdm_id (preserves pre-SG-4 behavior).
 *
 * Subscriber posture: rules are entity-scoped + lookup-driven (no hardcoded
 * presets). Templates come from CREDIT_RULE_TEMPLATES lookup.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_SETS } from '../../constants/roles';
import useSalesGoals from '../hooks/useSalesGoals';
import { useLookupBatch } from '../hooks/useLookups';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError, showSuccess } from '../utils/errorToast';

const styles = `
  .crm-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .crm-main { flex: 1; min-width: 0; padding: 20px; max-width: 1400px; margin: 0 auto; }
  .crm-header { margin-bottom: 16px; }
  .crm-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .crm-header p { color: var(--erp-muted); font-size: 13px; margin: 0; }
  .crm-panel { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #e5e7eb); border-radius: 14px; padding: 18px; margin-bottom: 16px; }
  .crm-actions { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; align-items: center; }
  .crm-btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .crm-btn-primary { background: var(--erp-accent, #2563eb); color: white; }
  .crm-btn-outline { background: transparent; border: 1px solid var(--erp-border); color: var(--erp-text); }
  .crm-btn-danger { background: #ef4444; color: white; }
  .crm-btn-sm { padding: 4px 10px; font-size: 12px; }
  .crm-input, .crm-select { padding: 7px 10px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel, #fff); color: var(--erp-text); width: 100%; box-sizing: border-box; }
  .crm-field { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 160px; }
  .crm-field label { font-size: 12px; font-weight: 600; color: var(--erp-muted); }
  .crm-row { display: flex; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
  .crm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .crm-table th { text-align: left; padding: 8px 10px; background: var(--erp-accent-soft, #eef2ff); font-weight: 600; color: var(--erp-text); white-space: nowrap; }
  .crm-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); color: var(--erp-text); vertical-align: top; }
  .crm-empty { text-align: center; padding: 40px 20px; color: var(--erp-muted); }
  .crm-tag { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .crm-tag-green { background: #dcfce7; color: #166534; }
  .crm-tag-red { background: #fee2e2; color: #991b1b; }
  .crm-tag-blue { background: #dbeafe; color: #1e40af; }
  .crm-modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .crm-modal { background: var(--erp-panel, #fff); border-radius: 14px; max-width: 720px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 24px; }
  .crm-modal h2 { margin: 0 0 12px; font-size: 18px; color: var(--erp-text); }
  @media(max-width: 768px) {
    .crm-main { padding: 12px; }
    .crm-row { flex-direction: column; }
  }
  @media(max-width: 360px) {
    .crm-main { padding: 8px; }
    .crm-header h1 { font-size: 18px; }
    .crm-btn { width: 100%; padding: 10px; font-size: 13px; }
    .crm-actions { flex-direction: column; align-items: stretch; }
  }
`;

const blankRule = () => ({
  rule_name: '',
  description: '',
  priority: 100,
  is_active: true,
  conditions: {
    territory_ids: [],
    product_codes: [],
    customer_codes: [],
    hospital_ids: [],
    sale_types: [],
    min_amount: null,
    max_amount: null,
  },
  credit_bdm_id: '',
  credit_pct: 100,
  effective_from: null,
  effective_to: null,
});

function csvToList(s) {
  if (!s) return [];
  return String(s).split(',').map(x => x.trim()).filter(Boolean);
}

export default function CreditRuleManager() {
  const { user } = useAuth();
  const sg = useSalesGoals();
  const { data: lookups } = useLookupBatch(['CREDIT_RULE_TEMPLATES', 'SALE_TYPE']);
  const templates = lookups.CREDIT_RULE_TEMPLATES || [];
  const saleTypeOptions = lookups.SALE_TYPE || [];

  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [users, setUsers] = useState([]);
  const [credits, setCredits] = useState([]);
  const [creditsTab, setCreditsTab] = useState('rules');

  const isAdminLike = ROLE_SETS.ADMIN_LIKE.includes(user?.role);

  // useSalesGoals() returns a fresh object every render (the method closures
  // are recreated each call). Including `sg` in useCallback deps would cause
  // an infinite re-render loop: load → setLoading → re-render → new sg → new
  // load → useEffect re-fires → loop. We intentionally omit `sg` from deps;
  // the methods only ever call `api.get/post` which are themselves stable
  // (memoized inside useErpApi).
  /* eslint-disable react-hooks/exhaustive-deps */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, uRes] = await Promise.all([
        sg.listCreditRules(),
        sg.get('/people/as-users'),
      ]);
      setRules(Array.isArray(rRes?.data) ? rRes.data : []);
      setUsers(Array.isArray(uRes?.data) ? uRes.data : (Array.isArray(uRes) ? uRes : []));
    } catch (err) {
      showError(err, 'Failed to load credit rules');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCredits = useCallback(async () => {
    try {
      const res = await sg.listSalesCredits({ limit: 200 });
      setCredits(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      showError(err, 'Failed to load credit ledger');
    }
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (creditsTab === 'ledger') loadCredits(); }, [creditsTab, loadCredits]);

  const startCreate = () => { setEditing(blankRule()); setShowForm(true); };
  const startEdit = (rule) => {
    // Normalize ObjectId arrays for the form (csv inputs)
    const e = { ...rule, conditions: { ...rule.conditions } };
    e.credit_bdm_id = rule.credit_bdm_id?._id || rule.credit_bdm_id || '';
    setEditing(e);
    setShowForm(true);
  };

  const applyTemplate = (code) => {
    const t = templates.find(t => t.code === code);
    if (!t || !t.metadata) return;
    setEditing(prev => ({
      ...prev,
      rule_name: prev.rule_name || t.label,
      description: t.metadata.description || '',
      priority: t.metadata.priority ?? prev.priority,
      credit_pct: t.metadata.credit_pct ?? prev.credit_pct,
      conditions: {
        ...prev.conditions,
        ...(t.metadata.conditions || {}),
      },
    }));
  };

  const save = async () => {
    if (!editing.rule_name.trim()) return showError(null, 'Rule name is required');
    if (!editing.credit_bdm_id) return showError(null, 'Credit BDM is required');
    if (!Number.isFinite(Number(editing.credit_pct))) return showError(null, 'Credit % must be a number');
    try {
      if (editing._id) {
        await sg.updateCreditRule(editing._id, editing);
        showSuccess('Rule updated');
      } else {
        await sg.createCreditRule(editing);
        showSuccess('Rule created');
      }
      setShowForm(false);
      setEditing(null);
      load();
    } catch (err) {
      showError(err, 'Failed to save rule');
    }
  };

  const deactivate = async (rule) => {
    if (!window.confirm(`Deactivate rule "${rule.rule_name}"? Historical SalesCredit rows are preserved.`)) return;
    try {
      await sg.deactivateCreditRule(rule._id);
      showSuccess('Rule deactivated');
      load();
    } catch (err) {
      showError(err, 'Failed to deactivate rule');
    }
  };

  const userOptions = useMemo(() => users.map(u => ({
    value: u._id || u.id,
    label: u.name || u.email || u.full_name || String(u._id || u.id),
  })), [users]);

  return (
    <div className="crm-page" style={{ display: 'flex' }}>
      <style>{styles}</style>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Navbar />
        <main className="crm-main">
          <div className="crm-header">
            <h1>Credit Rules</h1>
            <p>SAP-Commissions-pattern credit-assignment engine. Rules apply automatically on every sale post; absent any rule, full credit goes to the sale&apos;s BDM (legacy fallback).</p>
          </div>

          <WorkflowGuide pageKey="credit-rule-manager" />

          <div className="crm-panel">
            <div className="crm-actions">
              <button className={`crm-btn ${creditsTab === 'rules' ? 'crm-btn-primary' : 'crm-btn-outline'}`} onClick={() => setCreditsTab('rules')}>Rules</button>
              <button className={`crm-btn ${creditsTab === 'ledger' ? 'crm-btn-primary' : 'crm-btn-outline'}`} onClick={() => setCreditsTab('ledger')}>Credit Ledger</button>
              {creditsTab === 'rules' && isAdminLike && (
                <button className="crm-btn crm-btn-primary" onClick={startCreate} style={{ marginLeft: 'auto' }}>+ New Rule</button>
              )}
            </div>

            {creditsTab === 'rules' && (
              loading ? <div className="crm-empty">Loading rules…</div>
              : rules.length === 0 ? <div className="crm-empty">No credit rules. The engine falls back to 100% credit to sale.bdm_id (legacy). Create your first rule to override.</div>
              : (
                <table className="crm-table">
                  <thead>
                    <tr>
                      <th>Priority</th>
                      <th>Rule</th>
                      <th>Credit BDM</th>
                      <th>%</th>
                      <th>Conditions</th>
                      <th>Effective</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map(r => (
                      <tr key={r._id}>
                        <td>{r.priority}</td>
                        <td>
                          <strong>{r.rule_name}</strong>
                          {r.description ? <div style={{ fontSize: 11, color: 'var(--erp-muted)', marginTop: 2 }}>{r.description}</div> : null}
                        </td>
                        <td>{r.credit_bdm_id?.name || r.credit_bdm_id?.email || String(r.credit_bdm_id || '').slice(-6)}</td>
                        <td>{r.credit_pct}%</td>
                        <td style={{ fontSize: 11 }}>
                          {(r.conditions?.product_codes?.length || 0) > 0 && <div>Products: {r.conditions.product_codes.join(', ')}</div>}
                          {(r.conditions?.customer_codes?.length || 0) > 0 && <div>Customers: {r.conditions.customer_codes.join(', ')}</div>}
                          {(r.conditions?.sale_types?.length || 0) > 0 && <div>Sale types: {r.conditions.sale_types.join(', ')}</div>}
                          {(r.conditions?.min_amount != null) && <div>Min ₱{Number(r.conditions.min_amount).toLocaleString()}</div>}
                          {(r.conditions?.max_amount != null) && <div>Max ₱{Number(r.conditions.max_amount).toLocaleString()}</div>}
                          {!r.conditions || Object.keys(r.conditions).filter(k => Array.isArray(r.conditions[k]) ? r.conditions[k].length > 0 : r.conditions[k] != null).length === 0
                            ? <span style={{ color: 'var(--erp-muted)' }}>(matches all sales)</span> : null}
                        </td>
                        <td style={{ fontSize: 11 }}>
                          {r.effective_from ? new Date(r.effective_from).toISOString().slice(0, 10) : '—'} →&nbsp;
                          {r.effective_to ? new Date(r.effective_to).toISOString().slice(0, 10) : 'open'}
                        </td>
                        <td>
                          {r.is_active
                            ? <span className="crm-tag crm-tag-green">Active</span>
                            : <span className="crm-tag crm-tag-red">Inactive</span>}
                        </td>
                        <td>
                          {isAdminLike && (
                            <>
                              <button className="crm-btn crm-btn-outline crm-btn-sm" onClick={() => startEdit(r)}>Edit</button>
                              {r.is_active && <button className="crm-btn crm-btn-danger crm-btn-sm" onClick={() => deactivate(r)} style={{ marginLeft: 6 }}>Deactivate</button>}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}

            {creditsTab === 'ledger' && (
              credits.length === 0 ? <div className="crm-empty">No credit rows yet. Credits are written automatically when sales are posted.</div>
              : (
                <table className="crm-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Sale</th>
                      <th>BDM</th>
                      <th>Rule</th>
                      <th>%</th>
                      <th>Credited ₱</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {credits.map(c => (
                      <tr key={c._id}>
                        <td>{c.csi_date ? new Date(c.csi_date).toISOString().slice(0, 10) : '—'}</td>
                        <td>{c.sale_line_id?.doc_ref || c.sale_line_id?.invoice_number || String(c.sale_line_id?._id || '').slice(-6)}</td>
                        <td>{c.credit_bdm_id?.name || c.credit_bdm_id?.email || ''}</td>
                        <td>{c.rule_name || (c.source === 'fallback' ? '(fallback)' : '(manual)')}</td>
                        <td>{c.credit_pct}%</td>
                        <td>₱{Number(c.credited_amount || 0).toLocaleString()}</td>
                        <td>
                          <span className={`crm-tag ${c.source === 'rule' ? 'crm-tag-green' : c.source === 'fallback' ? 'crm-tag-blue' : 'crm-tag-red'}`}>{c.source}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>

          {showForm && editing && (
            <div className="crm-modal-bg" onClick={() => setShowForm(false)}>
              <div className="crm-modal" onClick={(e) => e.stopPropagation()}>
                <h2>{editing._id ? 'Edit' : 'New'} Credit Rule</h2>

                {!editing._id && templates.length > 0 && (
                  <div className="crm-row">
                    <div className="crm-field">
                      <label>Start from template (optional)</label>
                      <select className="crm-select" defaultValue="" onChange={(e) => e.target.value && applyTemplate(e.target.value)}>
                        <option value="">— Custom rule —</option>
                        {templates.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                <div className="crm-row">
                  <div className="crm-field"><label>Rule Name *</label>
                    <input className="crm-input" value={editing.rule_name} onChange={(e) => setEditing({ ...editing, rule_name: e.target.value })} />
                  </div>
                  <div className="crm-field" style={{ maxWidth: 120 }}><label>Priority</label>
                    <input className="crm-input" type="number" value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) })} />
                  </div>
                </div>

                <div className="crm-row">
                  <div className="crm-field" style={{ flex: 2 }}><label>Description</label>
                    <input className="crm-input" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                  </div>
                </div>

                <div className="crm-row">
                  <div className="crm-field"><label>Credit BDM *</label>
                    <select className="crm-select" value={editing.credit_bdm_id} onChange={(e) => setEditing({ ...editing, credit_bdm_id: e.target.value })}>
                      <option value="">— Select BDM —</option>
                      {userOptions.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                  </div>
                  <div className="crm-field" style={{ maxWidth: 120 }}><label>Credit % *</label>
                    <input className="crm-input" type="number" min="0" max="200" value={editing.credit_pct} onChange={(e) => setEditing({ ...editing, credit_pct: Number(e.target.value) })} />
                  </div>
                </div>

                <h3 style={{ fontSize: 14, marginTop: 16, marginBottom: 8, color: 'var(--erp-muted)' }}>Match conditions (AND-combined; empty = no constraint)</h3>

                <div className="crm-row">
                  <div className="crm-field"><label>Product codes (comma-separated)</label>
                    <input className="crm-input" placeholder="e.g. AMOX-500, PARA-500"
                      value={(editing.conditions?.product_codes || []).join(', ')}
                      onChange={(e) => setEditing({ ...editing, conditions: { ...editing.conditions, product_codes: csvToList(e.target.value) } })} />
                  </div>
                  <div className="crm-field"><label>Customer codes (comma-separated)</label>
                    <input className="crm-input" placeholder="e.g. CUST-001"
                      value={(editing.conditions?.customer_codes || []).join(', ')}
                      onChange={(e) => setEditing({ ...editing, conditions: { ...editing.conditions, customer_codes: csvToList(e.target.value) } })} />
                  </div>
                </div>

                <div className="crm-row">
                  <div className="crm-field"><label>Sale types</label>
                    <select className="crm-select" multiple
                      value={editing.conditions?.sale_types || []}
                      onChange={(e) => setEditing({ ...editing, conditions: { ...editing.conditions, sale_types: Array.from(e.target.selectedOptions).map(o => o.value) } })}
                      style={{ height: 90 }}>
                      {saleTypeOptions.map(o => <option key={o.code} value={o.code}>{o.label || o.code}</option>)}
                    </select>
                  </div>
                  <div className="crm-field" style={{ maxWidth: 140 }}><label>Min amount ₱</label>
                    <input className="crm-input" type="number" value={editing.conditions?.min_amount ?? ''} onChange={(e) => setEditing({ ...editing, conditions: { ...editing.conditions, min_amount: e.target.value === '' ? null : Number(e.target.value) } })} />
                  </div>
                  <div className="crm-field" style={{ maxWidth: 140 }}><label>Max amount ₱</label>
                    <input className="crm-input" type="number" value={editing.conditions?.max_amount ?? ''} onChange={(e) => setEditing({ ...editing, conditions: { ...editing.conditions, max_amount: e.target.value === '' ? null : Number(e.target.value) } })} />
                  </div>
                </div>

                <div className="crm-row">
                  <div className="crm-field"><label>Effective from</label>
                    <input className="crm-input" type="date" value={editing.effective_from ? String(editing.effective_from).slice(0, 10) : ''} onChange={(e) => setEditing({ ...editing, effective_from: e.target.value || null })} />
                  </div>
                  <div className="crm-field"><label>Effective to</label>
                    <input className="crm-input" type="date" value={editing.effective_to ? String(editing.effective_to).slice(0, 10) : ''} onChange={(e) => setEditing({ ...editing, effective_to: e.target.value || null })} />
                  </div>
                  <div className="crm-field" style={{ maxWidth: 120 }}><label>Active</label>
                    <select className="crm-select" value={String(editing.is_active)} onChange={(e) => setEditing({ ...editing, is_active: e.target.value === 'true' })}>
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </div>
                </div>

                <div className="crm-actions" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
                  <button className="crm-btn crm-btn-outline" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button>
                  <button className="crm-btn crm-btn-primary" onClick={save}>Save Rule</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
