/**
 * ErpSettingsPanel — Phase 24 (Control Center)
 *
 * Form UI for the ERP Settings model (~30+ configurable fields).
 * Groups: Per Diem, Fuel, Tax, Profit Sharing, Inventory, Collections,
 * Products, Authority, and COA Mapping.
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_SETS } from '../../constants/roles';
import useSettings from '../hooks/useSettings';
import api from '../../services/api';
import toast from 'react-hot-toast';

const pageStyles = `
  .esp-container { padding: 0; }
  .esp-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .esp-header h1 { font-size: 22px; font-weight: 700; color: var(--erp-text, #132238); margin: 0; }
  .esp-section { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #dbe4f0); border-radius: 14px; padding: 20px; margin-bottom: 16px; }
  .esp-section h3 { font-size: 14px; font-weight: 700; color: var(--erp-accent, #1e5eff); margin: 0 0 14px; padding-bottom: 8px; border-bottom: 1px solid var(--erp-border); }
  .esp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
  .esp-field { }
  .esp-field label { display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--erp-muted, #64748b); margin-bottom: 4px; letter-spacing: 0.3px; }
  .esp-field input[type="number"], .esp-field input[type="text"] { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; box-sizing: border-box; background: var(--erp-bg, #f4f7fb); }
  .esp-field input[type="checkbox"] { width: 18px; height: 18px; margin-right: 6px; vertical-align: middle; }
  .esp-field .esp-hint { font-size: 10px; color: var(--erp-muted); margin-top: 2px; }
  .esp-coa-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
  .esp-coa-item { display: flex; align-items: center; gap: 8px; }
  .esp-coa-item label { font-size: 11px; font-weight: 600; color: var(--erp-muted); min-width: 100px; white-space: nowrap; }
  .esp-coa-item input { width: 80px; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; font-family: monospace; text-align: center; }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border); color: var(--erp-text); }
  .esp-loading { text-align: center; padding: 40px; color: var(--erp-muted); }
  .esp-arrays { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .esp-arrays input { width: 70px; padding: 6px; border: 1px solid var(--erp-border); border-radius: 6px; font-size: 13px; text-align: center; }
  @media(max-width: 768px) { .esp-grid { grid-template-columns: 1fr; } .esp-coa-grid { grid-template-columns: 1fr; } }
`;

const COA_LABELS = {
  AR_TRADE: 'AR Trade', AR_BDM: 'AR BDM', IC_RECEIVABLE: 'IC Receivable',
  CASH_ON_HAND: 'Cash on Hand', PETTY_CASH: 'Petty Cash', INVENTORY: 'Inventory',
  INPUT_VAT: 'Input VAT', CWT_RECEIVABLE: 'CWT Receivable', ACCUM_DEPRECIATION: 'Accum. Depreciation',
  AP_TRADE: 'AP Trade', IC_PAYABLE: 'IC Payable', OUTPUT_VAT: 'Output VAT',
  LOANS_PAYABLE: 'Loans Payable', OWNER_CAPITAL: 'Owner Capital', OWNER_DRAWINGS: 'Owner Drawings',
  SALES_REVENUE: 'Sales Revenue', SERVICE_REVENUE: 'Service Revenue', INTEREST_INCOME: 'Interest Income',
  COGS: 'COGS', BDM_COMMISSION: 'BDM Commission', PARTNER_REBATE: 'Partner Rebate',
  PER_DIEM: 'Per Diem', TRANSPORT: 'Transport', SPECIAL_TRANSPORT: 'Special Transport',
  OTHER_REIMBURSABLE: 'Other Reimbursable', FUEL_GAS: 'Fuel & Gas',
  INVENTORY_WRITEOFF: 'Inventory Write-Off', INVENTORY_ADJ_GAIN: 'Inventory Adj Gain',
  MISC_EXPENSE: 'Misc Expense', DEPRECIATION: 'Depreciation', INTEREST_EXPENSE: 'Interest Expense',
  INTEREST_PAYABLE: 'Interest Payable', BANK_CHARGES: 'Bank Charges',
  // Payroll
  SALARIES_WAGES: 'Salaries & Wages', ALLOWANCES: 'Allowances', BONUS_13TH: 'Bonus & 13th Month',
  SSS_PAYABLE: 'SSS Payable', PHILHEALTH_PAYABLE: 'PhilHealth Payable',
  PAGIBIG_PAYABLE: 'Pag-IBIG Payable', WHT_PAYABLE: 'WHT Payable',
};

export function ErpSettingsPanelContent() {
  const { user } = useAuth();
  const { settings, loading: settingsLoading, refresh } = useSettings();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const canEdit = ROLE_SETS.MANAGEMENT.includes(user?.role);

  const buildForm = (s) => {
    // Ensure COA_MAP has all expected keys (fill missing with empty string)
    const coaMap = {};
    for (const key of Object.keys(COA_LABELS)) {
      coaMap[key] = s.COA_MAP?.[key] ?? '';
    }
    return {
      PERDIEM_RATE_DEFAULT: s.PERDIEM_RATE_DEFAULT ?? 800,
      PERDIEM_MD_FULL: s.PERDIEM_MD_FULL ?? 8,
      PERDIEM_MD_HALF: s.PERDIEM_MD_HALF ?? 3,
      FUEL_EFFICIENCY_DEFAULT: s.FUEL_EFFICIENCY_DEFAULT ?? 12,
      REVOLVING_FUND_AMOUNT: s.REVOLVING_FUND_AMOUNT ?? 8000,
      VAT_RATE: s.VAT_RATE ?? 0.12,
      CWT_RATE_WC158: s.CWT_RATE_WC158 ?? 0.01,
      SCPWD_DISCOUNT_RATE: s.SCPWD_DISCOUNT_RATE ?? 0.20,
      PROFIT_SHARE_BDM_PCT: s.PROFIT_SHARE_BDM_PCT ?? 0.30,
      PROFIT_SHARE_VIP_PCT: s.PROFIT_SHARE_VIP_PCT ?? 0.70,
      PROFIT_SHARE_MIN_PRODUCTS: s.PROFIT_SHARE_MIN_PRODUCTS ?? 5,
      PROFIT_SHARE_MIN_HOSPITALS: s.PROFIT_SHARE_MIN_HOSPITALS ?? 2,
      PS_CONSECUTIVE_MONTHS: s.PS_CONSECUTIVE_MONTHS ?? 3,
      NEAR_EXPIRY_DAYS: s.NEAR_EXPIRY_DAYS ?? 120,
      DEFAULT_PAYMENT_TERMS: s.DEFAULT_PAYMENT_TERMS ?? 30,
      COLLECTION_OK_THRESHOLD: s.COLLECTION_OK_THRESHOLD ?? 0.70,
      COMMISSION_RATES: Array.isArray(s.COMMISSION_RATES) ? [...s.COMMISSION_RATES] : [0, 0.005, 0.01, 0.02, 0.03, 0.04, 0.05],
      PARTNER_REBATE_RATES: Array.isArray(s.PARTNER_REBATE_RATES) ? [...s.PARTNER_REBATE_RATES] : [1, 2, 3, 5, 20, 25],
      MD_MAX_PRODUCT_TAGS: s.MD_MAX_PRODUCT_TAGS ?? 3,
      CONSIGNMENT_AGING_DEFAULT: s.CONSIGNMENT_AGING_DEFAULT ?? 90,
      ASSORTED_THRESHOLD: s.ASSORTED_THRESHOLD ?? 3,
      ENFORCE_AUTHORITY_MATRIX: s.ENFORCE_AUTHORITY_MATRIX ?? false,
      EXPENSE_ANOMALY_THRESHOLD: s.EXPENSE_ANOMALY_THRESHOLD ?? 0.30,
      GPS_VERIFICATION_THRESHOLD_M: s.GPS_VERIFICATION_THRESHOLD_M ?? 400,
      COA_MAP: coaMap
    };
  };

  useEffect(() => {
    if (settings && !form) {
      setForm(buildForm(settings));
    }
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put('/erp/settings', form);
      toast.success('Settings saved');
      // Re-build form from response to avoid loading flash
      if (res.data?.data) setForm(buildForm(res.data.data));
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    }
    setSaving(false);
  };

  const setField = (key, val) => setForm(prev => ({ ...prev, [key]: val }));
  const setCoa = (key, val) => setForm(prev => ({ ...prev, COA_MAP: { ...prev.COA_MAP, [key]: val } }));
  const setArrayItem = (key, idx, val) => {
    setForm(prev => {
      const arr = [...(prev[key] || [])];
      arr[idx] = parseFloat(val) || 0;
      return { ...prev, [key]: arr };
    });
  };

  if (settingsLoading || !form) return <><style>{pageStyles}</style><div className="esp-loading">Loading settings...</div></>;

  const numField = (key, label, hint) => (
    <div className="esp-field">
      <label>{label}</label>
      <input type="number" step="any" value={form[key]} onChange={e => setField(key, parseFloat(e.target.value) || 0)} disabled={!canEdit} />
      {hint && <div className="esp-hint">{hint}</div>}
    </div>
  );

  return (
    <>
      <style>{pageStyles}</style>
      <div className="esp-container">
        <div className="esp-header">
          <h1>ERP System Settings</h1>
          {canEdit && <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</button>}
        </div>

        <div className="esp-section">
          <h3>Per Diem (Global Defaults)</h3>
          <p style={{ fontSize: 12, color: 'var(--erp-muted, #5f7188)', margin: '0 0 8px' }}>
            These are global fallback values. Per-person overrides can be set in each BDM's CompProfile (People page → Full Threshold / Half Threshold). Setting Half Threshold to 0 means always at least half per diem.
          </p>
          <div className="esp-grid">
            {numField('PERDIEM_RATE_DEFAULT', 'Daily Rate (PHP)', 'Default per diem rate (overridable per BDM in CompProfile)')}
            {numField('PERDIEM_MD_FULL', 'Full Day MDs (default)', 'Min MDs for full per diem — per-person override in CompProfile')}
            {numField('PERDIEM_MD_HALF', 'Half Day MDs (default)', 'Min MDs for half per diem — per-person override in CompProfile')}
          </div>
        </div>

        <div className="esp-section">
          <h3>Fuel</h3>
          <div className="esp-grid">
            {numField('FUEL_EFFICIENCY_DEFAULT', 'KM per Liter', 'Default fuel efficiency')}
            {numField('REVOLVING_FUND_AMOUNT', 'Revolving Fund (PHP)', 'Revolving fund amount')}
          </div>
        </div>

        <div className="esp-section">
          <h3>Tax & Finance</h3>
          <div className="esp-grid">
            {numField('VAT_RATE', 'VAT Rate', 'e.g. 0.12 = 12%')}
            {numField('CWT_RATE_WC158', 'CWT Rate (WC158)', 'e.g. 0.01 = 1%')}
            {numField('SCPWD_DISCOUNT_RATE', 'SC/PWD Discount', 'e.g. 0.20 = 20%')}
          </div>
        </div>

        <div className="esp-section">
          <h3>Profit Sharing</h3>
          <div className="esp-grid">
            {numField('PROFIT_SHARE_BDM_PCT', 'BDM Share %', 'e.g. 0.30 = 30%')}
            {numField('PROFIT_SHARE_VIP_PCT', 'VIP Share %', 'e.g. 0.70 = 70%')}
            {numField('PROFIT_SHARE_MIN_PRODUCTS', 'Min Products', 'Required for eligibility')}
            {numField('PROFIT_SHARE_MIN_HOSPITALS', 'Min Hospitals', 'Required for eligibility')}
            {numField('PS_CONSECUTIVE_MONTHS', 'Consecutive Months', 'Months required')}
          </div>
        </div>

        <div className="esp-section">
          <h3>Inventory</h3>
          <div className="esp-grid">
            {numField('NEAR_EXPIRY_DAYS', 'Near Expiry (Days)', 'Days before expiry to flag')}
          </div>
        </div>

        <div className="esp-section">
          <h3>Collections</h3>
          <div className="esp-grid">
            {numField('DEFAULT_PAYMENT_TERMS', 'Payment Terms (Days)', 'Default days')}
            {numField('COLLECTION_OK_THRESHOLD', 'OK Threshold', 'e.g. 0.70 = 70%')}
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', display: 'block', marginBottom: 6 }}>COMMISSION RATES (tiers)</label>
            <div className="esp-arrays">
              {(form.COMMISSION_RATES || []).map((v, i) => (
                <input key={i} type="number" step="0.001" value={v} onChange={e => setArrayItem('COMMISSION_RATES', i, e.target.value)} disabled={!canEdit} />
              ))}
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', display: 'block', marginBottom: 6 }}>PARTNER REBATE RATES (%)</label>
            <div className="esp-arrays">
              {(form.PARTNER_REBATE_RATES || []).map((v, i) => (
                <input key={i} type="number" step="0.5" value={v} onChange={e => setArrayItem('PARTNER_REBATE_RATES', i, e.target.value)} disabled={!canEdit} />
              ))}
            </div>
          </div>
        </div>

        <div className="esp-section">
          <h3>Products & Consignment</h3>
          <div className="esp-grid">
            {numField('MD_MAX_PRODUCT_TAGS', 'Max Product Tags', 'Per MD visit')}
            {numField('CONSIGNMENT_AGING_DEFAULT', 'Consignment Aging (Days)', 'Default aging days')}
          </div>
        </div>

        <div className="esp-section">
          <h3>Authority & Compliance</h3>
          <div className="esp-grid">
            <div className="esp-field">
              <label>
                <input type="checkbox" checked={form.ENFORCE_AUTHORITY_MATRIX} onChange={e => setField('ENFORCE_AUTHORITY_MATRIX', e.target.checked)} disabled={!canEdit} />
                Enforce Authority Matrix
              </label>
              <div className="esp-hint">Require approval workflows for transactions</div>
            </div>
            {numField('EXPENSE_ANOMALY_THRESHOLD', 'Anomaly Threshold', 'e.g. 0.30 = 30% deviation')}
            {numField('GPS_VERIFICATION_THRESHOLD_M', 'GPS Threshold (meters)', 'Distance for verified vs suspicious visits')}
            {numField('ASSORTED_THRESHOLD', 'Assorted Threshold', 'Receipts with N+ line items → Assorted Items')}
          </div>
        </div>

        <div className="esp-section">
          <h3>COA Mapping</h3>
          <p style={{ fontSize: 12, color: 'var(--erp-muted)', margin: '0 0 12px' }}>
            Account codes used by the auto-journal engine. Change these to remap where transactions post.
          </p>
          <div className="esp-coa-grid">
            {Object.entries(COA_LABELS).map(([key, label]) => (
              <div className="esp-coa-item" key={key}>
                <label>{label}</label>
                <input value={form.COA_MAP?.[key] || ''} onChange={e => setCoa(key, e.target.value)} disabled={!canEdit} />
              </div>
            ))}
          </div>
        </div>

        {canEdit && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</button>
          </div>
        )}
      </div>
    </>
  );
}

export default ErpSettingsPanelContent;
