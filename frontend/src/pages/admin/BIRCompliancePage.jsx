/**
 * BIRCompliancePage — Phase VIP-1.J (Apr 2026)
 *
 * The accountant dashboard. President / admin / finance / bookkeeper see
 * every BIR obligation across the active entity for the selected year:
 * monthly heatmap of forms × periods, color-coded by status; data-quality
 * strip with TIN / address gap counts and on-demand scan; upcoming
 * deadlines (next 30 days); per-entity tax-config card (TIN, RDO, tax_type,
 * VAT registration, etc.); recent export audit trail.
 *
 * Lookup-driven: form catalog comes from BIR_FORMS_CATALOG (per-entity); if
 * a subscriber disables 1606 because they don't pay rent, the row hides
 * without a code change. Status colors come from BIR_FILING_STATUS lookup.
 *
 * Role gates are backend-driven via BIR_ROLES (birAccess.js). The route
 * guard here is `BIR_FILING` (admin/finance/president/bookkeeper).
 *
 * Route: /admin/bir
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Clock,
  FileText, Calendar, Loader, Settings as SettingsIcon, X, Save,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import PageGuide from '../../components/common/PageGuide';
import birService from '../../erp/services/birService';

const STATUS_META = {
  DATA_INCOMPLETE: { label: 'Data Incomplete', bg: '#fef2f2', fg: '#991b1b', icon: AlertTriangle },
  DRAFT:           { label: 'Draft',            bg: '#fef9c3', fg: '#854d0e', icon: FileText },
  REVIEWED:        { label: 'Reviewed',         bg: '#dbeafe', fg: '#1e40af', icon: CheckCircle2 },
  FILED:           { label: 'Filed',            bg: '#e0e7ff', fg: '#3730a3', icon: CheckCircle2 },
  CONFIRMED:       { label: 'Confirmed',        bg: '#dcfce7', fg: '#15803d', icon: CheckCircle2 },
  OVERDUE:         { label: 'Overdue',          bg: '#fee2e2', fg: '#b91c1c', icon: AlertTriangle },
  NEVER_RUN:       { label: '—',                bg: '#f3f4f6', fg: '#6b7280', icon: XCircle },
};

const QUALITY_META = {
  OK:        { label: 'Data quality OK',           bg: '#dcfce7', fg: '#15803d', icon: CheckCircle2 },
  WARN:      { label: 'Some records need fixing',  bg: '#fef9c3', fg: '#854d0e', icon: AlertTriangle },
  BLOCK:     { label: 'BLOCKED — fix before filing', bg: '#fee2e2', fg: '#b91c1c', icon: AlertTriangle },
  RUNNING:   { label: 'Scan running…',             bg: '#dbeafe', fg: '#1e40af', icon: Loader },
  NEVER_RUN: { label: 'Run a scan',                bg: '#f3f4f6', fg: '#6b7280', icon: RefreshCw },
};

const styles = `
  .bir-layout { min-height: 100vh; background: #f3f4f6; }
  .bir-content { display: flex; }
  .bir-main { flex: 1; padding: 1.5rem; max-width: 100vw; }
  .bir-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  .bir-row { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
  .bir-pill { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.55rem; border-radius: 999px; font-size: 0.8rem; font-weight: 600; }
  .bir-grid { display: grid; gap: 0.5rem; grid-template-columns: minmax(200px, 1fr) repeat(12, minmax(70px, 1fr)); }
  .bir-grid-quarterly { display: grid; gap: 0.5rem; grid-template-columns: minmax(200px, 1fr) repeat(4, minmax(70px, 1fr)); }
  .bir-grid-annual { display: grid; gap: 0.5rem; grid-template-columns: minmax(200px, 1fr) minmax(100px, 1fr); }
  .bir-grid-perpayee { display: grid; gap: 0.5rem; grid-template-columns: minmax(200px, 1fr) minmax(150px, 1fr); }
  .bir-cell { padding: 0.5rem; text-align: center; border-radius: 6px; font-size: 0.78rem; cursor: pointer; transition: filter .15s; }
  .bir-cell:hover { filter: brightness(0.96); }
  .bir-form-row-label { font-size: 0.85rem; font-weight: 600; padding: 0.5rem 0.25rem; }
  .bir-form-row-meta { font-size: 0.7rem; color: #6b7280; font-weight: 400; }
  .bir-h2 { font-size: 1rem; font-weight: 700; margin-bottom: 0.6rem; display: flex; align-items: center; gap: 0.4rem; }
  .bir-deadline { display: flex; gap: 0.5rem; align-items: center; padding: 0.5rem; border-bottom: 1px solid #f3f4f6; }
  .bir-deadline:last-child { border-bottom: 0; }
  .bir-btn { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.45rem 0.85rem; border-radius: 6px; font-size: 0.85rem; font-weight: 600; border: 1px solid transparent; cursor: pointer; transition: filter .15s; }
  .bir-btn-primary { background: #2563eb; color: #fff; }
  .bir-btn-primary:hover { filter: brightness(0.9); }
  .bir-btn-secondary { background: #fff; color: #374151; border-color: #d1d5db; }
  .bir-btn-secondary:hover { background: #f9fafb; }
  .bir-input { padding: 0.45rem 0.6rem; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.85rem; }
  .bir-config-grid { display: grid; gap: 0.85rem 1rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .bir-config-cell { display: flex; flex-direction: column; gap: 0.25rem; }
  .bir-config-label { font-size: 0.72rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
  .bir-config-value { font-size: 0.95rem; font-weight: 600; color: #111827; }
  .bir-config-missing { color: #b91c1c; font-style: italic; }
  .bir-modal-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.45); display: flex; align-items: center; justify-content: center; z-index: 1000; }
  .bir-modal { background: #fff; border-radius: 12px; padding: 1.25rem; max-width: 640px; width: 92%; max-height: 90vh; overflow: auto; }
  @media (max-width: 900px) {
    .bir-grid { grid-template-columns: 1fr; }
    .bir-grid > .bir-form-row-label { padding: 0.5rem 0; border-top: 1px solid #e5e7eb; }
  }
`;

export default function BIRCompliancePage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanRunning, setScanRunning] = useState(false);
  const [showFindings, setShowFindings] = useState(false);
  const [findings, setFindings] = useState([]);
  const [showConfig, setShowConfig] = useState(false);
  const [configDraft, setConfigDraft] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await birService.getDashboard(year);
      setDashboard(data);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load BIR dashboard');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const onRunScan = async () => {
    setScanRunning(true);
    try {
      const result = await birService.runDataQuality();
      toast.success(`Scan complete — status: ${result.status} (${result.findings_count} findings)`);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Data Quality scan failed');
    } finally {
      setScanRunning(false);
    }
  };

  const onShowFindings = async () => {
    try {
      const data = await birService.getDataQualityFindings();
      setFindings(data.findings || []);
      setShowFindings(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load findings');
    }
  };

  const onOpenConfig = async () => {
    try {
      const cfg = await birService.getEntityConfig();
      setConfigDraft({ ...cfg });
      setShowConfig(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load entity config');
    }
  };

  const onSaveConfig = async () => {
    try {
      await birService.updateEntityConfig(configDraft);
      toast.success('Tax config saved. Re-running data-quality scan…');
      setShowConfig(false);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Save failed');
    }
  };

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  const dq = dashboard?.data_quality;
  const dqMeta = QUALITY_META[dq?.status] || QUALITY_META.NEVER_RUN;
  const DqIcon = dqMeta.icon;

  return (
    <div className="bir-layout">
      <style>{styles}</style>
      <Navbar />
      <div className="bir-content">
        <Sidebar />
        <main className="bir-main">
          <div className="bir-row" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={22} color="#2563eb" />
              BIR Compliance Dashboard
            </h1>
            <div className="bir-row">
              <select
                className="bir-input"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10))}
                aria-label="Year"
              >
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button className="bir-btn bir-btn-secondary" onClick={onOpenConfig}>
                <SettingsIcon size={14} /> Tax Config
              </button>
              <button className="bir-btn bir-btn-secondary" onClick={load}>
                <RefreshCw size={14} /> Refresh
              </button>
            </div>
          </div>

          <PageGuide pageKey="bir-compliance" />

          {loading && <div className="bir-card"><Loader size={16} /> Loading…</div>}

          {!loading && dashboard?.entity && (
            <>
              {/* Entity tax-config card */}
              <div className="bir-card">
                <div className="bir-h2">
                  <FileText size={16} /> Entity tax registration — {dashboard.entity.entity_name}
                  <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: dashboard.entity.config_completeness < 100 ? '#b91c1c' : '#15803d' }}>
                    Config: {dashboard.entity.config_completeness}% complete
                  </span>
                </div>
                <div className="bir-config-grid">
                  <ConfigCell label="TIN"               value={dashboard.entity.tin} missing="Missing — required" />
                  <ConfigCell label="RDO Code"          value={dashboard.entity.rdo_code} missing="Set RDO code" />
                  <ConfigCell label="Tax Type"          value={dashboard.entity.tax_type} />
                  <ConfigCell label="Business Style"    value={dashboard.entity.business_style} missing="Set business style" />
                  <ConfigCell label="VAT Registered"    value={dashboard.entity.vat_registered ? 'Yes' : 'No'} />
                  <ConfigCell label="Top Withholding Agent" value={dashboard.entity.top_withholding_agent ? 'Yes' : 'No'} />
                  <ConfigCell label="Withholding Engine" value={dashboard.entity.withholding_active ? 'ON' : 'OFF (build-only — Phase J2)'} />
                  <ConfigCell label="Rent Withholding"  value={dashboard.entity.rent_withholding_active ? 'ON' : 'OFF'} />
                  <ConfigCell label="Filing Email"      value={dashboard.entity.tax_filing_email} missing="Set email — auto-confirm bridge needs it" />
                </div>
              </div>

              {/* Data quality strip */}
              <div className="bir-card">
                <div className="bir-h2">
                  <DqIcon size={16} /> Data Quality
                  <span className="bir-pill" style={{ background: dqMeta.bg, color: dqMeta.fg, marginLeft: 'auto' }}>{dqMeta.label}</span>
                </div>
                {dq && dq.summary ? (
                  <>
                    <div className="bir-row" style={{ gap: '1.5rem', fontSize: '0.85rem' }}>
                      <span>Hospitals: <strong>{dq.summary.hospital_issues}</strong> / {dq.summary.hospital_total}</span>
                      <span>Customers: <strong>{dq.summary.customer_issues}</strong> / {dq.summary.customer_total}</span>
                      <span>Vendors: <strong>{dq.summary.vendor_issues}</strong> / {dq.summary.vendor_total}</span>
                      <span>People: <strong>{dq.summary.people_issues}</strong> / {dq.summary.people_total}</span>
                      <span>Doctors: <strong>{dq.summary.doctor_issues}</strong> / {dq.summary.doctor_total}</span>
                      <span>Entity: {dq.summary.entity_self ? <strong style={{ color: '#b91c1c' }}>missing fields</strong> : 'OK'}</span>
                    </div>
                    {dq.blocked_forms_due_within_7d?.length > 0 && (
                      <div style={{ marginTop: '0.6rem', fontSize: '0.85rem', color: '#b91c1c' }}>
                        <AlertTriangle size={14} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
                        Blocking forms due within 7 days: <strong>{dq.blocked_forms_due_within_7d.join(', ')}</strong>
                      </div>
                    )}
                  </>
                ) : (
                  <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>No scan yet. Click &quot;Run Scan&quot; to find missing TIN / address records.</p>
                )}
                <div className="bir-row" style={{ marginTop: '0.75rem' }}>
                  <button className="bir-btn bir-btn-primary" onClick={onRunScan} disabled={scanRunning}>
                    {scanRunning ? <Loader size={14} /> : <RefreshCw size={14} />} Run Scan
                  </button>
                  <button className="bir-btn bir-btn-secondary" onClick={onShowFindings} disabled={!dq || !dq.findings_count}>
                    Drill-down ({dq?.findings_count || 0})
                  </button>
                </div>
              </div>

              {/* Upcoming deadlines */}
              <div className="bir-card">
                <div className="bir-h2"><Calendar size={16} /> Upcoming deadlines (next 30 days)</div>
                {dashboard.deadlines?.length > 0 ? (
                  dashboard.deadlines.map(d => (
                    <div key={`${d.form_code}-${d.period_label}`} className="bir-deadline">
                      <span className="bir-pill" style={{ background: STATUS_META[d.status]?.bg, color: STATUS_META[d.status]?.fg }}>
                        {STATUS_META[d.status]?.label}
                      </span>
                      <span style={{ fontWeight: 600 }}>{d.label}</span>
                      <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>{d.period_label}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: d.days_remaining <= 7 ? '#b91c1c' : '#374151' }}>
                        Due {new Date(d.due_date).toLocaleDateString()} • <strong>{d.days_remaining}d remaining</strong>
                      </span>
                    </div>
                  ))
                ) : (
                  <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>No filings due in the next 30 days. Nice.</p>
                )}
              </div>

              {/* Form heatmap */}
              <div className="bir-card">
                <div className="bir-h2"><Calendar size={16} /> {year} Filing Heatmap — {dashboard.forms.length} forms</div>
                {dashboard.forms.map(f => (
                  <div key={f.form_code} style={{ marginBottom: '0.75rem' }}>
                    <div className="bir-form-row-label">
                      {f.label}
                      <div className="bir-form-row-meta">{f.frequency} • {f.channel} • {f.description}</div>
                    </div>
                    <div className={
                      f.frequency === 'MONTHLY' ? 'bir-grid'
                      : f.frequency === 'QUARTERLY' ? 'bir-grid-quarterly'
                      : f.frequency === 'ANNUAL' ? 'bir-grid-annual'
                      : 'bir-grid-perpayee'
                    } style={{ gridColumn: '1 / -1' }}>
                      <div /> {/* spacer for label column alignment */}
                      {f.cells.map(c => {
                        const meta = STATUS_META[c.status] || STATUS_META.DRAFT;
                        return (
                          <div
                            key={c.period_label}
                            className="bir-cell"
                            style={{ background: meta.bg, color: meta.fg }}
                            title={`${c.period_label} — ${meta.label}${c.due_date ? `\nDue ${new Date(c.due_date).toLocaleDateString()}` : ''}`}
                          >
                            <div style={{ fontSize: '0.7rem', opacity: 0.85 }}>{c.period_label}</div>
                            <div style={{ fontWeight: 600 }}>{meta.label}</div>
                            {c.per_payee_count !== undefined && (
                              <div style={{ fontSize: '0.7rem' }}>{c.per_payee_count} entries</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Recent exports */}
              {dashboard.recent_exports?.length > 0 && (
                <div className="bir-card">
                  <div className="bir-h2"><Clock size={16} /> Recent exports</div>
                  {dashboard.recent_exports.slice(0, 10).map((e, idx) => (
                    <div key={idx} className="bir-deadline">
                      <span className="bir-pill" style={{ background: '#dbeafe', color: '#1e40af' }}>{e.form_code}</span>
                      <span style={{ color: '#6b7280' }}>{e.period_label}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#374151' }}>
                        {e.artifact_kind} • {(e.byte_length / 1024).toFixed(1)} KB • {new Date(e.exported_at).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {showFindings && (
            <div className="bir-modal-backdrop" onClick={() => setShowFindings(false)}>
              <div className="bir-modal" onClick={(e) => e.stopPropagation()}>
                <div className="bir-row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Data Quality Findings ({findings.length})</h2>
                  <button className="bir-btn bir-btn-secondary" onClick={() => setShowFindings(false)}><X size={14} /></button>
                </div>
                {findings.length === 0
                  ? <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>No findings.</p>
                  : findings.slice(0, 200).map((f, idx) => (
                      <div key={idx} className="bir-deadline">
                        <span className="bir-pill" style={{ background: '#fef9c3', color: '#854d0e' }}>{f.collection_kind}</span>
                        <span style={{ fontWeight: 600 }}>{f.display_name}</span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#b91c1c' }}>{f.issue_codes.join(', ')}</span>
                      </div>
                    ))}
                {findings.length > 200 && (
                  <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.5rem' }}>
                    Showing first 200 of {findings.length}. Download CSV TBD (Phase J0.5 stretch).
                  </p>
                )}
              </div>
            </div>
          )}

          {showConfig && configDraft && (
            <div className="bir-modal-backdrop" onClick={() => setShowConfig(false)}>
              <div className="bir-modal" onClick={(e) => e.stopPropagation()}>
                <div className="bir-row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Edit tax registration — {configDraft.entity_name}</h2>
                  <button className="bir-btn bir-btn-secondary" onClick={() => setShowConfig(false)}><X size={14} /></button>
                </div>
                <div className="bir-config-grid">
                  <ConfigInput label="TIN" placeholder="123-456-789-00000" value={configDraft.tin} onChange={v => setConfigDraft({ ...configDraft, tin: v })} />
                  <ConfigInput label="RDO Code" placeholder="e.g. 050" value={configDraft.rdo_code} onChange={v => setConfigDraft({ ...configDraft, rdo_code: v })} />
                  <ConfigSelect label="Tax Type" value={configDraft.tax_type} onChange={v => setConfigDraft({ ...configDraft, tax_type: v })}
                    options={[
                      { value: 'CORP', label: 'Corporation (1702)' },
                      { value: 'OPC', label: 'One Person Corporation (1702)' },
                      { value: 'SOLE_PROP', label: 'Sole Proprietorship (1701)' },
                      { value: 'PARTNERSHIP', label: 'Partnership (1702)' },
                    ]} />
                  <ConfigInput label="Business Style" placeholder="e.g. Pharmaceutical Distribution" value={configDraft.business_style} onChange={v => setConfigDraft({ ...configDraft, business_style: v })} />
                  <ConfigInput label="Filing Email (BIR confirmations)" placeholder="yourpartner@viosintegrated.net" value={configDraft.tax_filing_email} onChange={v => setConfigDraft({ ...configDraft, tax_filing_email: v })} />
                  <ConfigInput label="Address" placeholder="Full registered address" value={configDraft.address} onChange={v => setConfigDraft({ ...configDraft, address: v })} />
                  <ConfigCheckbox label="VAT Registered (12%)" checked={configDraft.vat_registered} onChange={v => setConfigDraft({ ...configDraft, vat_registered: v })} />
                  <ConfigCheckbox label="Top Withholding Agent (TWA)" checked={configDraft.top_withholding_agent} onChange={v => setConfigDraft({ ...configDraft, top_withholding_agent: v })} />
                  <ConfigCheckbox label="Contractor Withholding Active (1601-EQ)" checked={configDraft.withholding_active} onChange={v => setConfigDraft({ ...configDraft, withholding_active: v })} />
                  <ConfigCheckbox label="Rent Withholding Active (1606)" checked={configDraft.rent_withholding_active} onChange={v => setConfigDraft({ ...configDraft, rent_withholding_active: v })} />
                </div>
                <div className="bir-row" style={{ marginTop: '1rem', justifyContent: 'flex-end' }}>
                  <button className="bir-btn bir-btn-secondary" onClick={() => setShowConfig(false)}>Cancel</button>
                  <button className="bir-btn bir-btn-primary" onClick={onSaveConfig}><Save size={14} /> Save</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function ConfigCell({ label, value, missing }) {
  const isMissing = !value && missing;
  return (
    <div className="bir-config-cell">
      <span className="bir-config-label">{label}</span>
      <span className={`bir-config-value ${isMissing ? 'bir-config-missing' : ''}`}>{value || missing || '—'}</span>
    </div>
  );
}

function ConfigInput({ label, value, onChange, placeholder }) {
  return (
    <div className="bir-config-cell">
      <span className="bir-config-label">{label}</span>
      <input className="bir-input" value={value || ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ConfigSelect({ label, value, onChange, options }) {
  return (
    <div className="bir-config-cell">
      <span className="bir-config-label">{label}</span>
      <select className="bir-input" value={value || ''} onChange={(e) => onChange(e.target.value)}>
        {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </div>
  );
}

function ConfigCheckbox({ label, checked, onChange }) {
  return (
    <div className="bir-config-cell">
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
        <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
    </div>
  );
}
