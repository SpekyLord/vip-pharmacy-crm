/**
 * StorefrontRebatePanel — Phase R-Storefront Phase 1 (May 8 2026)
 *
 * Manual MD rebate + BDM commission attribution panel for storefront cash
 * sales (CASH_RECEIPT + SERVICE_INVOICE routed through petty_cash_fund).
 * Mirrors the green panel from CollectionSession.jsx but lands its writes
 * directly on the SalesLine via POST /api/erp/sales/:id/storefront-rebate-
 * attribution. Editable post-POSTED — once posted, the sale was paid;
 * admin attaches MDs after the fact when identified.
 *
 * Two layouts depending on sale_type:
 *   - SERVICE_INVOICE — top-level partner_tags (no line items)
 *   - CASH_RECEIPT    — per-line partner_tags (one MD set per line item)
 *
 * Permission to render the Save button comes from the caller — server-side
 * the endpoint enforces canProxyEntry(sales, proxy_rebate_entry, SALES_REBATE_ENTRY).
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../services/api';
import doctorService from '../../services/doctorService';
import useSettings from '../hooks/useSettings';
import SelectField from '../../components/common/Select';
import { showError, showSuccess } from '../utils/errorToast';

const styles = `
  .sf-rebate-panel { margin-top: 16px; padding: 12px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; }
  .sf-rebate-title { font-size: 13px; font-weight: 700; color: #14532d; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.4px; }
  .sf-rebate-line { padding: 10px; background: #fff; border: 1px solid #d1fae5; border-radius: 6px; margin-bottom: 8px; }
  .sf-rebate-line-header { font-size: 12px; font-weight: 600; color: #14532d; margin-bottom: 6px; }
  .sf-rebate-row { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
  .sf-partner-tag { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: #ede9fe; border-radius: 6px; font-size: 12px; color: #5b21b6; font-weight: 500; }
  .sf-partner-tag .sf-remove-btn { background: none; border: none; color: #991b1b; cursor: pointer; font-size: 15px; padding: 0; line-height: 1; }
  .sf-rebate-amount { font-size: 11px; color: #16a34a; font-weight: 600; }
  .sf-commission-block { padding: 8px; background: #fff; border: 1px solid #d1fae5; border-radius: 6px; margin-bottom: 8px; }
  .sf-commission-label { font-size: 11px; font-weight: 600; color: #14532d; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 4px; }
  .sf-actions { display: flex; gap: 8px; margin-top: 12px; }
  .sf-audit { margin-top: 8px; font-size: 10px; color: #64748b; font-style: italic; }
`;

export default function StorefrontRebatePanel({ sale, onSaved, onClose }) {
  const { settings } = useSettings();
  const [crmDoctors, setCrmDoctors] = useState([]);
  const [commissionPct, setCommissionPct] = useState(Number(sale.commission_pct) || 0);
  // For CASH_RECEIPT/CSI: Map<line_item._id_str, partner_tags[]>
  const [linePartnerTags, setLinePartnerTags] = useState(() => {
    const m = {};
    for (const li of sale.line_items || []) {
      m[String(li._id)] = li.partner_tags || [];
    }
    return m;
  });
  // For SERVICE_INVOICE: top-level partner_tags
  const [topLevelPartnerTags, setTopLevelPartnerTags] = useState(sale.partner_tags || []);
  const [saving, setSaving] = useState(false);

  const isService = sale.sale_type === 'SERVICE_INVOICE';
  const commRates = useMemo(() => settings?.COMMISSION_RATES || [0, 0.005, 0.01, 0.02, 0.03, 0.04, 0.05], [settings]);
  const rebateRates = useMemo(() => settings?.PARTNER_REBATE_RATES || [1, 2, 3, 5, 20, 25], [settings]);

  // Load CRM doctors for partner picker — scoped to BDM who closed the sale.
  // Same pattern as CollectionSession: doctorService.getByBdm(sale.bdm_id).
  useEffect(() => {
    let active = true;
    if (!sale.bdm_id) return undefined;
    doctorService.getByBdm(sale.bdm_id).then(res => {
      if (!active) return;
      const docs = (res?.data?.data || res?.data || []).map(d => ({
        _id: d._id,
        name: `${d.lastName || ''}, ${d.firstName || ''}`.trim(),
        role: d.role || d.specialization || '',
      }));
      docs.sort((a, b) => a.name.localeCompare(b.name));
      setCrmDoctors(docs);
    }).catch(() => active && setCrmDoctors([]));
    return () => { active = false; };
  }, [sale.bdm_id]);

  // ── handlers for per-line tags ────────────────────────────────────────
  const addLineTag = useCallback((lineId, doctorId) => {
    const doc = crmDoctors.find(d => d._id === doctorId);
    if (!doc) return;
    setLinePartnerTags(prev => {
      const existing = prev[lineId] || [];
      if (existing.some(t => String(t.doctor_id) === String(doctorId))) return prev;
      return {
        ...prev,
        [lineId]: [...existing, {
          doctor_id: doc._id,
          doctor_name: doc.name,
          role: doc.role,
          rebate_pct: rebateRates[0] || 1,
        }]
      };
    });
  }, [crmDoctors, rebateRates]);

  const removeLineTag = useCallback((lineId, doctorId) => {
    setLinePartnerTags(prev => ({
      ...prev,
      [lineId]: (prev[lineId] || []).filter(t => String(t.doctor_id) !== String(doctorId))
    }));
  }, []);

  const updateLineTagPct = useCallback((lineId, doctorId, pct) => {
    setLinePartnerTags(prev => ({
      ...prev,
      [lineId]: (prev[lineId] || []).map(t =>
        String(t.doctor_id) === String(doctorId) ? { ...t, rebate_pct: parseFloat(pct) } : t
      )
    }));
  }, []);

  // ── handlers for top-level tags (SERVICE_INVOICE) ─────────────────────
  const addTopTag = useCallback((doctorId) => {
    const doc = crmDoctors.find(d => d._id === doctorId);
    if (!doc) return;
    setTopLevelPartnerTags(prev => {
      if (prev.some(t => String(t.doctor_id) === String(doctorId))) return prev;
      return [...prev, {
        doctor_id: doc._id,
        doctor_name: doc.name,
        role: doc.role,
        rebate_pct: rebateRates[0] || 1,
      }];
    });
  }, [crmDoctors, rebateRates]);

  const removeTopTag = useCallback((doctorId) => {
    setTopLevelPartnerTags(prev => prev.filter(t => String(t.doctor_id) !== String(doctorId)));
  }, []);

  const updateTopTagPct = useCallback((doctorId, pct) => {
    setTopLevelPartnerTags(prev => prev.map(t =>
      String(t.doctor_id) === String(doctorId) ? { ...t, rebate_pct: parseFloat(pct) } : t
    ));
  }, []);

  // ── save ──────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const body = { commission_pct: Number(commissionPct) || 0 };
      if (isService) {
        body.partner_tags = topLevelPartnerTags;
      } else {
        body.line_items = (sale.line_items || []).map(li => ({
          _id: String(li._id),
          partner_tags: linePartnerTags[String(li._id)] || [],
        }));
      }
      const res = await api.post(`/erp/sales/${sale._id}/storefront-rebate-attribution`, body);
      showSuccess('Storefront rebate attribution saved');
      if (onSaved) onSaved(res?.data?.data);
    } catch (err) {
      showError(err?.response?.data?.message || err.message || 'Failed to save attribution');
    } finally {
      setSaving(false);
    }
  }, [sale, commissionPct, topLevelPartnerTags, linePartnerTags, isService, onSaved]);

  return (
    <div className="sf-rebate-panel">
      <style>{styles}</style>
      <div className="sf-rebate-title">🩺 MD Rebate &amp; BDM Commission — Storefront Cash Sale</div>

      {/* Commission % at top — shape matches CollectionSession green panel. */}
      <div className="sf-commission-block">
        <div className="sf-commission-label">Commission %</div>
        <SelectField
          value={String(commissionPct)}
          onChange={e => setCommissionPct(parseFloat(e.target.value) || 0)}
          style={{ minWidth: 120 }}
        >
          {commRates.map(r => {
            const pct = r * 100;
            return <option key={r} value={pct}>{pct}%</option>;
          })}
        </SelectField>
        <span className="sf-rebate-amount" style={{ marginLeft: 12 }}>
          = ₱{((sale.total_net_of_vat || 0) * (Number(commissionPct) || 0) / 100).toFixed(2)}
        </span>
      </div>

      {/* Per-line OR top-level partner_tags */}
      {isService ? (
        <div className="sf-rebate-line">
          <div className="sf-rebate-line-header">Partner Tags (VIP Client — MD Rebate)</div>
          {topLevelPartnerTags.map(tag => (
            <div key={tag.doctor_id} className="sf-rebate-row">
              <span className="sf-partner-tag">
                {tag.doctor_name}{tag.role ? ` — ${tag.role}` : ''}
                <button className="sf-remove-btn" onClick={() => removeTopTag(tag.doctor_id)} title="Remove">×</button>
              </span>
              <SelectField value={tag.rebate_pct} onChange={e => updateTopTagPct(tag.doctor_id, e.target.value)}>
                {rebateRates.map(r => <option key={r} value={r}>{r}%</option>)}
              </SelectField>
              <span className="sf-rebate-amount">
                = ₱{((sale.total_net_of_vat || 0) * (Number(tag.rebate_pct) || 0) / 100).toFixed(2)}
              </span>
            </div>
          ))}
          <div className="sf-rebate-row">
            <SelectField
              value=""
              onChange={e => { if (e.target.value) addTopTag(e.target.value); }}
              style={{ minWidth: 240 }}
            >
              <option value="">+ Add VIP Client partner...</option>
              {crmDoctors
                .filter(d => !topLevelPartnerTags.some(t => String(t.doctor_id) === String(d._id)))
                .map(d => (
                  <option key={d._id} value={d._id}>{d.name}{d.role ? ` — ${d.role}` : ''}</option>
                ))}
            </SelectField>
          </div>
        </div>
      ) : (
        (sale.line_items || []).map((li, idx) => {
          const lineId = String(li._id);
          const tags = linePartnerTags[lineId] || [];
          const lineNet = Number(li.net_of_vat) || 0;
          return (
            <div key={lineId} className="sf-rebate-line">
              <div className="sf-rebate-line-header">
                Line {idx + 1}: {li.item_key || li.product_id}
                &nbsp;— Qty {li.qty} × ₱{Number(li.unit_price).toLocaleString()}
                &nbsp;(Net ₱{lineNet.toFixed(2)})
              </div>
              {tags.map(tag => (
                <div key={tag.doctor_id} className="sf-rebate-row">
                  <span className="sf-partner-tag">
                    {tag.doctor_name}{tag.role ? ` — ${tag.role}` : ''}
                    <button className="sf-remove-btn" onClick={() => removeLineTag(lineId, tag.doctor_id)} title="Remove">×</button>
                  </span>
                  <SelectField value={tag.rebate_pct} onChange={e => updateLineTagPct(lineId, tag.doctor_id, e.target.value)}>
                    {rebateRates.map(r => <option key={r} value={r}>{r}%</option>)}
                  </SelectField>
                  <span className="sf-rebate-amount">
                    = ₱{(lineNet * (Number(tag.rebate_pct) || 0) / 100).toFixed(2)}
                  </span>
                </div>
              ))}
              <div className="sf-rebate-row">
                <SelectField
                  value=""
                  onChange={e => { if (e.target.value) addLineTag(lineId, e.target.value); }}
                  style={{ minWidth: 240 }}
                >
                  <option value="">+ Add VIP Client partner...</option>
                  {crmDoctors
                    .filter(d => !tags.some(t => String(t.doctor_id) === String(d._id)))
                    .map(d => (
                      <option key={d._id} value={d._id}>{d.name}{d.role ? ` — ${d.role}` : ''}</option>
                    ))}
                </SelectField>
              </div>
            </div>
          );
        })
      )}

      {sale.partner_rebate_entry_mode === 'MANUAL_PROXY' && sale.proxy_rebate_entered_at && (
        <div className="sf-audit">
          Last attributed by user {String(sale.proxy_rebate_entered_by || '')} on {new Date(sale.proxy_rebate_entered_at).toLocaleString('en-PH')}
          {' '}— audit history: {(sale.proxy_rebate_edit_history || []).length} entries
        </div>
      )}

      <div className="sf-actions">
        <button
          className="btn btn-sm"
          style={{ background: '#16a34a', color: '#fff' }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : '💾 Save Attribution'}
        </button>
        <button className="btn btn-sm" onClick={onClose} disabled={saving} style={{ background: '#e2e8f0' }}>
          Close
        </button>
      </div>
    </div>
  );
}
