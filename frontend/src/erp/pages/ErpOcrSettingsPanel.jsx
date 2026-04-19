/**
 * ErpOcrSettingsPanel — Phase H3
 *
 * Per-entity OCR governance for Control Center → Intelligence section.
 * Lookup-driven, subscription-ready: admin/finance/president can disable
 * OCR (subscribers pay nothing), gate AI fallback, restrict doc types,
 * and set monthly call quotas — all without code changes.
 *
 * Manual photo upload is NEVER blocked by these flags — disabling OCR only
 * skips the Vision API call so the storefront pays for nothing it doesn't use.
 */
import { useEffect, useState } from 'react';
import { getOcrSettings, updateOcrSettings, getOcrUsage } from '../services/ocrService';
import { useAuth } from '../../hooks/useAuth';

const styles = `
  .ocr-panel { display: flex; flex-direction: column; gap: 20px; }
  .ocr-card { background: #fff; border: 1px solid #dbe4f0; border-radius: 12px; padding: 20px; }
  .ocr-card h3 { margin: 0 0 12px; font-size: 15px; font-weight: 700; color: #132238; }
  .ocr-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #f1f5f9; gap: 16px; }
  .ocr-row:last-child { border-bottom: none; }
  .ocr-label { font-size: 13px; color: #334155; flex: 1; }
  .ocr-label small { display: block; color: #64748b; font-size: 11px; margin-top: 2px; }
  .ocr-toggle { position: relative; width: 44px; height: 24px; background: #cbd5e1; border-radius: 12px; cursor: pointer; transition: background .15s; flex-shrink: 0; }
  .ocr-toggle.on { background: #16a34a; }
  .ocr-toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: #fff; border-radius: 50%; transition: transform .15s; }
  .ocr-toggle.on::after { transform: translateX(20px); }
  .ocr-input { padding: 6px 10px; border: 1px solid #dbe4f0; border-radius: 6px; font-size: 13px; width: 100px; text-align: right; }
  .ocr-doc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; margin-top: 8px; }
  .ocr-doc-chip { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border: 1px solid #dbe4f0; border-radius: 6px; cursor: pointer; font-size: 12px; user-select: none; }
  .ocr-doc-chip.on { background: #eff6ff; border-color: #2563eb; color: #1e40af; font-weight: 600; }
  .ocr-actions { display: flex; gap: 8px; justify-content: flex-end; }
  .ocr-btn { padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; font-size: 13px; font-weight: 600; }
  .ocr-btn-primary { background: #2563eb; color: #fff; }
  .ocr-btn-primary:disabled { background: #94a3b8; cursor: not-allowed; }
  .ocr-btn-outline { background: transparent; color: #475569; border: 1px solid #dbe4f0; }
  .ocr-banner { background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%); border: 1px solid #bfdbfe; border-radius: 12px; padding: 12px 16px; font-size: 12px; line-height: 1.7; color: #1e40af; }
  .ocr-banner strong { display: block; margin-bottom: 4px; font-size: 13px; }
  .ocr-stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
  .ocr-stat { background: #f8fafc; border-radius: 8px; padding: 12px; text-align: center; }
  .ocr-stat-num { font-size: 22px; font-weight: 700; color: #132238; }
  .ocr-stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; margin-top: 4px; }
  .ocr-quota-bar { height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; margin-top: 6px; }
  .ocr-quota-fill { height: 100%; background: #16a34a; transition: width .2s; }
  .ocr-quota-fill.warn { background: #f59e0b; }
  .ocr-quota-fill.danger { background: #dc2626; }
  .ocr-empty { text-align: center; padding: 40px; color: #64748b; font-size: 13px; }
  .ocr-error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 10px 12px; border-radius: 8px; font-size: 12px; }
  .ocr-success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 10px 12px; border-radius: 8px; font-size: 12px; }
`;

const ALL_DOC_TYPES_FALLBACK = ['CSI', 'CR', 'CWT_2307', 'GAS_RECEIPT', 'ODOMETER', 'OR', 'UNDERTAKING', 'DR'];
const DOC_TYPE_LABELS = {
  CSI: 'Charge Sales Invoice',
  CR: 'Collection Receipt',
  CWT_2307: 'BIR 2307',
  GAS_RECEIPT: 'Gas Receipt',
  ODOMETER: 'Odometer',
  OR: 'Official Receipt',
  UNDERTAKING: 'GRN Undertaking',
  DR: 'Delivery Receipt',
};

export default function ErpOcrSettingsPanel() {
  const { user } = useAuth();
  const canEdit = ['admin', 'finance', 'president'].includes(user?.role);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [settings, setSettings] = useState(null);
  const [usage, setUsage] = useState(null);
  const [allDocTypes, setAllDocTypes] = useState(ALL_DOC_TYPES_FALLBACK);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, u] = await Promise.all([getOcrSettings(), getOcrUsage({ group_by: 'doc_type' })]);
        if (!alive) return;
        setSettings(s);
        if (s.all_doc_types) setAllDocTypes(s.all_doc_types);
        setUsage(u);
      } catch (err) {
        if (alive) setError(err.response?.data?.message || err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const update = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

  const toggleDocType = (dt) => {
    setSettings(prev => {
      const cur = new Set(prev.allowed_doc_types || []);
      if (cur.has(dt)) cur.delete(dt); else cur.add(dt);
      return { ...prev, allowed_doc_types: Array.from(cur) };
    });
  };

  const save = async () => {
    setSaving(true); setError(null); setMessage(null);
    try {
      const updated = await updateOcrSettings({
        enabled: settings.enabled,
        ai_fallback_enabled: settings.ai_fallback_enabled,
        ai_field_completion_enabled: settings.ai_field_completion_enabled,
        preprocessing_enabled: settings.preprocessing_enabled,
        vendor_auto_learn_enabled: settings.vendor_auto_learn_enabled,
        allowed_doc_types: settings.allowed_doc_types,
        monthly_call_quota: Number(settings.monthly_call_quota) || 0,
        usage_logging_enabled: settings.usage_logging_enabled,
      });
      setSettings(prev => ({ ...prev, ...updated }));
      setMessage('OCR settings saved.');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="ocr-empty">Loading OCR settings…</div>;
  if (!settings) return <div className="ocr-error">{error || 'Failed to load OCR settings.'}</div>;

  const monthly = usage?.current_month;
  const quotaPct = monthly && monthly.quota > 0 ? (monthly.vision_calls / monthly.quota) * 100 : 0;
  const quotaClass = quotaPct >= 100 ? 'danger' : quotaPct >= 80 ? 'warn' : '';

  return (
    <div className="ocr-panel">
      <style>{styles}</style>

      <div className="ocr-banner">
        <strong>OCR Governance — per entity, subscription-ready</strong>
        Disabling OCR or any document type below only skips the Vision API call — users can ALWAYS upload a photo as the manual fallback. The form simply isn&apos;t auto-filled. This makes OCR cost-controllable per subscriber.
      </div>

      {error && <div className="ocr-error">{error}</div>}
      {message && <div className="ocr-success">{message}</div>}

      <div className="ocr-card">
        <h3>Master Switches</h3>
        <div className="ocr-row">
          <div className="ocr-label">
            OCR Enabled
            <small>When OFF, all OCR calls return photo-only response. Manual upload still works.</small>
          </div>
          <div className={`ocr-toggle ${settings.enabled ? 'on' : ''}`}
               onClick={() => canEdit && update('enabled', !settings.enabled)}
               role="switch" aria-checked={settings.enabled} tabIndex={canEdit ? 0 : -1} />
        </div>
        <div className="ocr-row">
          <div className="ocr-label">
            AI Fallback (Claude — classification)
            <small>When regex confidence is LOW, retry classification (vendor/COA) with Claude. Costs ~$0.003 per call.</small>
          </div>
          <div className={`ocr-toggle ${settings.ai_fallback_enabled ? 'on' : ''}`}
               onClick={() => canEdit && update('ai_fallback_enabled', !settings.ai_fallback_enabled)}
               role="switch" aria-checked={settings.ai_fallback_enabled} tabIndex={canEdit ? 0 : -1} />
        </div>
        <div className="ocr-row">
          <div className="ocr-label">
            AI Field Completion (Claude — missing values)
            <small>Even when classification is HIGH, ask Claude to fill missing/low-confidence fields like amount, date, OR number. Boosts auto-fill on messy receipts.</small>
          </div>
          <div className={`ocr-toggle ${settings.ai_field_completion_enabled ? 'on' : ''}`}
               onClick={() => canEdit && update('ai_field_completion_enabled', !settings.ai_field_completion_enabled)}
               role="switch" aria-checked={settings.ai_field_completion_enabled} tabIndex={canEdit ? 0 : -1} />
        </div>
        <div className="ocr-row">
          <div className="ocr-label">
            Image Preprocessing
            <small>Auto-rotate + grayscale + contrast + sharpen before sending to Vision. Typically 15–30% accuracy lift on phone photos. Disable only if a particular receipt format scans worse.</small>
          </div>
          <div className={`ocr-toggle ${settings.preprocessing_enabled ? 'on' : ''}`}
               onClick={() => canEdit && update('preprocessing_enabled', !settings.preprocessing_enabled)}
               role="switch" aria-checked={settings.preprocessing_enabled} tabIndex={canEdit ? 0 : -1} />
        </div>
        <div className="ocr-row">
          <div className="ocr-label">
            Vendor Auto-Learn (Claude wins)
            <small>When Claude classifies a new vendor successfully, save it to the Vendor Master (status: UNREVIEWED). Next scan hits EXACT_VENDOR without firing Claude — reduces ongoing AI cost. Admin reviews learned vendors before they influence classification confidence.</small>
          </div>
          <div className={`ocr-toggle ${settings.vendor_auto_learn_enabled ? 'on' : ''}`}
               onClick={() => canEdit && update('vendor_auto_learn_enabled', !settings.vendor_auto_learn_enabled)}
               role="switch" aria-checked={settings.vendor_auto_learn_enabled} tabIndex={canEdit ? 0 : -1} />
        </div>
        <div className="ocr-row">
          <div className="ocr-label">
            Usage Logging
            <small>Records every call for billing/audit. Required for monthly quota enforcement.</small>
          </div>
          <div className={`ocr-toggle ${settings.usage_logging_enabled ? 'on' : ''}`}
               onClick={() => canEdit && update('usage_logging_enabled', !settings.usage_logging_enabled)}
               role="switch" aria-checked={settings.usage_logging_enabled} tabIndex={canEdit ? 0 : -1} />
        </div>
      </div>

      <div className="ocr-card">
        <h3>Allowed Document Types</h3>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
          Click a chip to allow/disallow OCR for that document type. Disallowed types still upload as plain photos.
        </div>
        <div className="ocr-doc-grid">
          {allDocTypes.map(dt => {
            const on = (settings.allowed_doc_types || []).includes(dt);
            return (
              <div key={dt} className={`ocr-doc-chip ${on ? 'on' : ''}`}
                   onClick={() => canEdit && toggleDocType(dt)}>
                <input type="checkbox" checked={on} readOnly style={{ pointerEvents: 'none' }} />
                <span>{DOC_TYPE_LABELS[dt] || dt}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="ocr-card">
        <h3>Monthly Call Quota</h3>
        <div className="ocr-row">
          <div className="ocr-label">
            Vision API calls per month
            <small>Set to 0 for unlimited. When exceeded, OCR is skipped but photo upload still works.</small>
          </div>
          <input type="number" min="0" className="ocr-input"
                 value={settings.monthly_call_quota || 0}
                 disabled={!canEdit}
                 onChange={e => update('monthly_call_quota', e.target.value)} />
        </div>
        {monthly && (
          <>
            <div className="ocr-quota-bar">
              <div className={`ocr-quota-fill ${quotaClass}`}
                   style={{ width: `${Math.min(100, quotaPct)}%` }} />
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, textAlign: 'right' }}>
              {monthly.vision_calls} used this month
              {monthly.quota > 0 && ` / ${monthly.quota} quota (${monthly.remaining} remaining)`}
            </div>
          </>
        )}
      </div>

      {usage?.auto_learn && (usage.auto_learn.CREATED || usage.auto_learn.ALIAS_ADDED || usage.auto_learn.SKIPPED) ? (
        <div className="ocr-card">
          <h3>Vendor Auto-Learn (all time)</h3>
          <div className="ocr-stat-grid">
            <div className="ocr-stat">
              <div className="ocr-stat-num">{usage.auto_learn.CREATED || 0}</div>
              <div className="ocr-stat-label">Vendors Created</div>
            </div>
            <div className="ocr-stat">
              <div className="ocr-stat-num">{usage.auto_learn.ALIAS_ADDED || 0}</div>
              <div className="ocr-stat-label">Aliases Added</div>
            </div>
            <div className="ocr-stat">
              <div className="ocr-stat-num">{usage.auto_learn.SKIPPED || 0}</div>
              <div className="ocr-stat-label">Skipped (Guardrail)</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
            Review auto-learned vendors in Vendor Master (filter: &quot;Auto-Learned, Unreviewed&quot;). Approved vendors become first-class in classification. Rejected vendors are deactivated.
          </div>
        </div>
      ) : null}

      {usage && (
        <div className="ocr-card">
          <h3>Usage by Document Type (all time)</h3>
          {usage.rows.length === 0 ? (
            <div className="ocr-empty">No OCR calls yet.</div>
          ) : (
            <div className="ocr-stat-grid">
              {usage.rows.map(r => (
                <div key={r._id} className="ocr-stat">
                  <div className="ocr-stat-num">{r.total_calls}</div>
                  <div className="ocr-stat-label">{r._id}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                    {r.successful} ok • {r.skipped} skipped<br/>
                    {Math.round(r.avg_latency_ms || 0)}ms avg
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {canEdit && (
        <div className="ocr-actions">
          <button className="ocr-btn ocr-btn-primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      )}
    </div>
  );
}
