/**
 * PersonDetail — Phase 21.1: Full editable person page
 *
 * 7 sections: A) Person Info, B) Comp Profile, C) Insurance Register,
 * D) ERP Module Access (ErpAccessManager), E) History (comp + payslip),
 * F) Cross-Entity Functional Role Assignments (Phase 31),
 * G) KPI Self-Rating Summary (Phase 32)
 *
 * Edit mode: admin/finance/president only. BDMs see read-only.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ROLES, ROLE_SETS } from '../../constants/roles';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import usePeople from '../hooks/usePeople';
import usePayroll from '../hooks/usePayroll';
import useErpAccess from '../hooks/useErpAccess';
import useFunctionalRoles from '../hooks/useFunctionalRoles';
import useKpiSelfRating from '../hooks/useKpiSelfRating';
import { showError, showSuccess, showWarning } from '../utils/errorToast';
import ErpAccessManager from '../components/ErpAccessManager';
import api from '../../services/api';
import * as XLSX from 'xlsx';
import { safeXlsxRead } from '../utils/safeXlsxRead';
import { useLookupBatch } from '../hooks/useLookups';
import WorkflowGuide from '../components/WorkflowGuide';

const css = `
  .pd-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .pd-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 960px; margin: 0 auto; }
  .pd-back { font-size: 13px; color: var(--erp-accent, #1e5eff); cursor: pointer; margin-bottom: 12px; display: inline-block; }
  .pd-card { background: var(--erp-panel, #fff); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .pd-card-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .pd-card-hdr h3 { margin: 0; font-size: 15px; font-weight: 700; color: var(--erp-text); }
  .pd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; }
  .pd-grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px 16px; }
  .pd-field { font-size: 13px; }
  .pd-field .lbl { font-size: 11px; color: var(--erp-muted, #64748b); font-weight: 600; margin-bottom: 2px; }
  .pd-field .val { color: var(--erp-text, #1a1a2e); }
  .pd-field input, .pd-field select { width: 100%; padding: 6px 10px; border: 1px solid var(--erp-border, #d1d5db); border-radius: 6px; font-size: 13px; box-sizing: border-box; }
  .pd-field input[type="date"] { min-height: 36px; }
  .pd-field input[type="checkbox"] { width: auto; margin-right: 6px; }
  .pd-check { display: flex; align-items: center; font-size: 13px; gap: 4px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; }
  .pd-btn { padding: 5px 14px; border-radius: 6px; font-size: 12px; cursor: pointer; border: 1px solid var(--erp-border, #d1d5db); background: #fff; }
  .pd-btn-p { background: var(--erp-accent, #1e5eff); color: #fff; border: none; }
  .pd-btn-d { border-color: #fca5a5; color: #dc2626; }
  .pd-sep { border: none; border-top: 1px solid var(--erp-border, #e5e7eb); margin: 16px 0; }
  .pd-tbl { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  .pd-tbl th { text-align: left; padding: 6px 8px; background: var(--erp-accent-soft, #e8efff); font-size: 11px; color: var(--erp-muted); }
  .pd-tbl td { padding: 6px 8px; border-top: 1px solid var(--erp-border); }
  .pd-empty { color: #64748b; font-size: 13px; padding: 12px 0; }
  .pd-ins-card { border: 1px solid var(--erp-border, #e5e7eb); border-radius: 8px; padding: 12px; margin-bottom: 8px; }
  .pd-ins-type { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--erp-accent); }
  @media(max-width: 768px) { .pd-main { padding: 12px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); } .pd-grid, .pd-grid3 { grid-template-columns: 1fr; } }
  @media(max-width: 375px) { .pd-main { padding: 8px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); } .pd-main input, .pd-main select { font-size: 16px; } }
`;

// All dropdown categories fetched in a single batch call (was 13 individual calls)
const LOOKUP_CATEGORIES = [
  'PERSON_TYPE', 'EMPLOYMENT_TYPE', 'VEHICLE_TYPE', 'BDM_STAGE', 'ROLE_MAPPING', 'SYSTEM_ROLE',
  'CIVIL_STATUS', 'PERSON_STATUS', 'SALARY_TYPE', 'TAX_STATUS', 'INCENTIVE_TYPE',
  'INSURANCE_TYPE', 'INSURANCE_FREQUENCY', 'INSURANCE_STATUS',
];

const fmt = (n) => n != null ? `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : '—';
const toInput = (d) => d ? new Date(d).toISOString().split('T')[0] : '';

// ── Field component: view/edit toggle ──
 
function F({ lbl, val, name, type = 'text', editing, form, onChange, options, className }) {
  if (!editing) return <div className={`pd-field ${className || ''}`}><div className="lbl">{lbl}</div><div className="val">{val ?? '—'}</div></div>;
  if (options) return (
    <div className={`pd-field ${className || ''}`}><div className="lbl">{lbl}</div>
      <select name={name} value={form[name] || ''} onChange={onChange}><option value="">—</option>{options.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}</select>
    </div>
  );
  if (type === 'checkbox') return (
    <div className={`pd-field pd-check ${className || ''}`}><input type="checkbox" name={name} checked={!!form[name]} onChange={e => onChange({ target: { name, value: e.target.checked } })} /><div className="lbl">{lbl}</div></div>
  );
  return (
    <div className={`pd-field ${className || ''}`}><div className="lbl">{lbl}</div>
      <input type={type} name={name} value={form[name] ?? ''} onChange={onChange} /></div>
  );
}
 

export default function PersonDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const pplApi = usePeople();
  const payApi = usePayroll();

  const { data: lookups, loading: lookupsLoading } = useLookupBatch(LOOKUP_CATEGORIES);
  const codes = (cat) => (lookups[cat] || []).map(o => o.code);

  const PERSON_TYPES = codes('PERSON_TYPE');
  const EMP_TYPES = codes('EMPLOYMENT_TYPE');
  const VEHICLE_TYPES = codes('VEHICLE_TYPE');
  const BDM_STAGES = codes('BDM_STAGE');
  const roleMappingOpts = useMemo(() => lookups.ROLE_MAPPING || [], [lookups.ROLE_MAPPING]);
  const systemRoleOpts = useMemo(() => lookups.SYSTEM_ROLE || [], [lookups.SYSTEM_ROLE]);
  // Derive role from person_type via ROLE_MAPPING lookup
  const getMappedRole = useCallback((personType) => {
    const mapping = roleMappingOpts.find(m => m.metadata?.person_type === personType);
    return mapping?.metadata?.system_role || 'contractor';
  }, [roleMappingOpts]);
  const CIVIL_STATUSES = codes('CIVIL_STATUS');
  const PERSON_STATUSES = codes('PERSON_STATUS');
  const SALARY_TYPES = codes('SALARY_TYPE');
  const TAX_STATUSES = codes('TAX_STATUS');
  const INCENTIVE_TYPES = codes('INCENTIVE_TYPE');
  const INS_TYPES = codes('INSURANCE_TYPE');
  const INS_FREQ = codes('INSURANCE_FREQUENCY');
  const INS_STATUS = codes('INSURANCE_STATUS');

  const canEdit = ROLE_SETS.MANAGEMENT.includes(user?.role);
  const isPresident = user?.role === ROLES.PRESIDENT;

  const [person, setPerson] = useState(null);
  const [payslips, setPayslips] = useState([]);
  const [insurance, setInsurance] = useState([]);
  const [loading, setLoading] = useState(true);

  // Edit states
  const [editPerson, setEditPerson] = useState(false);
  const [editComp, setEditComp] = useState(false);
  const [personForm, setPersonForm] = useState({});
  const [compForm, setCompForm] = useState({});
  const [insForm, setInsForm] = useState(null); // null = closed, {} = new, {_id} = editing
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '', template_id: '', role: '' });
  const [accessTemplates, setAccessTemplates] = useState([]);
  const erpAccess = useErpAccess();
  const { fetchByPerson: fetchFuncRoles } = useFunctionalRoles();
  const [funcRoleAssignments, setFuncRoleAssignments] = useState([]);
  const { fetchByPerson: fetchPersonRatings } = useKpiSelfRating();
  const [latestRating, setLatestRating] = useState(null);
  const [allPeople, setAllPeople] = useState([]);
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, psRes, insRes] = await Promise.all([
        pplApi.getPersonById(id),
        payApi.getPayslipHistory(id, { limit: 12 }),
        api.get('/erp/insurance', { params: { person_id: id } }).then(r => r.data).catch(() => ({ data: [] })),
      ]);
      const p = pRes?.data || null;
      setPerson(p);
      setPayslips(psRes?.data || []);
      setInsurance(insRes?.data || []);
      if (p) {
        setPersonForm({
          full_name: p.full_name || '', first_name: p.first_name || '', last_name: p.last_name || '',
          email: p.email || '', phone: p.phone || '', bdm_stage: p.bdm_stage || '',
          person_type: p.person_type || '', position: p.position || '', department: p.department || '',
          employment_type: p.employment_type || '', status: p.status || 'ACTIVE', reports_to: p.reports_to?._id || '',
          date_hired: toInput(p.date_hired), date_regularized: toInput(p.date_regularized), date_separated: toInput(p.date_separated),
          date_of_birth: toInput(p.date_of_birth), live_date: toInput(p.live_date), civil_status: p.civil_status || '',
          'government_ids.sss_no': p.government_ids?.sss_no || '', 'government_ids.philhealth_no': p.government_ids?.philhealth_no || '',
          'government_ids.pagibig_no': p.government_ids?.pagibig_no || '', 'government_ids.tin': p.government_ids?.tin || '',
          'bank_account.bank': p.bank_account?.bank || '', 'bank_account.account_no': p.bank_account?.account_no || '',
          'bank_account.account_name': p.bank_account?.account_name || '',
        });
        const c = p.comp_profile || {};
        setCompForm({
          salary_type: c.salary_type || 'FIXED_SALARY', effective_date: toInput(c.effective_date) || toInput(new Date()),
          basic_salary: c.basic_salary || 0, rice_allowance: c.rice_allowance || 0,
          clothing_allowance: c.clothing_allowance || 0, medical_allowance: c.medical_allowance || 0,
          laundry_allowance: c.laundry_allowance || 0, transport_allowance: c.transport_allowance || 0,
          incentive_type: c.incentive_type || 'NONE', incentive_rate: c.incentive_rate || 0,
          incentive_description: c.incentive_description || '', incentive_cap: c.incentive_cap || 0,
          perdiem_rate: c.perdiem_rate || 0, perdiem_days: c.perdiem_days || 22,
          km_per_liter: c.km_per_liter || 0, fuel_overconsumption_threshold: c.fuel_overconsumption_threshold || 1.3,
          smer_eligible: !!c.smer_eligible, logbook_eligible: !!c.logbook_eligible,
          ore_eligible: !!c.ore_eligible, access_eligible: !!c.access_eligible,
          calf_override: !!c.calf_override, crm_linked: !!c.crm_linked,
          perdiem_engagement_threshold_full: c.perdiem_engagement_threshold_full || 8,
          perdiem_engagement_threshold_half: c.perdiem_engagement_threshold_half || 3,
          vehicle_type: c.vehicle_type || 'NONE', tax_status: c.tax_status || 'S',
          profit_share_eligible: !!c.profit_share_eligible, commission_rate: c.commission_rate || 0,
          reason: '',
        });
      }
    } catch (err) { console.error('[PersonDetail]', err.message); }
    finally { setLoading(false); }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    erpAccess.getTemplates().then(res => setAccessTemplates(res?.data || [])).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (id) fetchFuncRoles(id).then(setFuncRoleAssignments).catch(() => {});
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (id && canEdit) fetchPersonRatings(id).then(ratings => {
      if (ratings?.length) setLatestRating(ratings[0]);
    }).catch(() => {});
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    pplApi.getPeopleList({ limit: 200, exclude_status: 'SEPARATED' }).then(r => setAllPeople(r?.data || [])).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Warn if any lookup categories loaded empty (seeding may be needed)
  const lookupWarnShown = useRef(false);
  useEffect(() => {
    if (lookupsLoading || lookupWarnShown.current) return;
    const empty = LOOKUP_CATEGORIES.filter(c => c !== 'ROLE_MAPPING' && (!lookups[c] || lookups[c].length === 0));
    if (empty.length > 0) {
      showWarning(`Some dropdown options are empty: ${empty.join(', ')}. Seed them in Control Center > Lookup Tables.`);
      lookupWarnShown.current = true;
    }
  }, [lookupsLoading, lookups]);

  // Role-People alignment warning: check person_type vs linked user role via ROLE_MAPPING
  const roleMismatchShown = useRef(null);
  useEffect(() => {
    if (!person?.user_id?.role || !person?.person_type || roleMappingOpts.length === 0) return;
    const checkKey = `${id}-${person.person_type}-${person.user_id.role}`;
    if (roleMismatchShown.current === checkKey) return;
    const mapping = roleMappingOpts.find(m => m.metadata?.person_type === person.person_type);
    if (!mapping) return;
    const expectedRole = mapping.metadata?.system_role;
    const actualRole = person.user_id.role;
    if (expectedRole && actualRole && expectedRole !== actualRole) {
      showWarning(`Role mismatch: ${person.person_type} should map to '${expectedRole}' but linked user has role '${actualRole}'`);
    }
    roleMismatchShown.current = checkKey;
  }, [id, person, roleMappingOpts]);

  const handlePersonChange = (e) => setPersonForm(f => ({ ...f, [e.target.name]: e.target.value }));
  const handleCompChange = (e) => {
    const val = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
    setCompForm(f => ({ ...f, [e.target.name]: val }));
  };

  const savePerson = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      // Flatten nested keys
      const data = {};
      for (const [k, v] of Object.entries(personForm)) {
        if (k.includes('.')) {
          const [parent, child] = k.split('.');
          if (!data[parent]) data[parent] = {};
          data[parent][child] = v;
        } else data[k] = v;
      }
      await pplApi.updatePerson(id, data);
      setEditPerson(false);
      load();
    } catch (err) { showError(err, 'Could not save changes'); }
    finally { savingRef.current = false; }
  };

  const handleCreateLogin = async () => {
    if (!loginForm.email || !loginForm.password) return;
    try {
      const payload = { email: loginForm.email, password: loginForm.password };
      if (loginForm.template_id) payload.template_id = loginForm.template_id;
      if (loginForm.role) payload.role = loginForm.role;
      await pplApi.createLoginForPerson(id, payload);
      showSuccess(loginForm.template_id ? 'Login created with ERP access template!' : 'Login created! Configure ERP access below.');
      setShowLoginForm(false);
      setLoginForm({ email: '', password: '', template_id: '', role: '' });
      load();
    } catch (err) {
      showError(err, 'Could not create login — check email and password requirements');
    }
  };

  const saveComp = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      const profileId = person.comp_profile?._id;
      if (profileId) {
        await pplApi.updateCompProfile(id, profileId, compForm);
      } else {
        await pplApi.createCompProfile(id, compForm);
      }
      setEditComp(false);
      load();
    } catch (err) { showError(err, 'Could not save changes'); }
    finally { savingRef.current = false; }
  };

  // Insurance CRUD
  const [insFormData, setInsFormData] = useState({});
  const handleInsChange = (e) => {
    const val = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
    setInsFormData(f => ({ ...f, [e.target.name]: val }));
  };
  const openInsForm = (policy) => {
    if (policy) {
      setInsFormData({ ...policy, effective_date: toInput(policy.effective_date), expiry_date: toInput(policy.expiry_date) });
    } else {
      setInsFormData({ policy_type: 'LIFE', provider: '', policy_no: '', coverage_amount: 0, premium_amount: 0, premium_frequency: 'ANNUAL', effective_date: '', expiry_date: '', beneficiary: '', vehicle_plate_no: '', vehicle_description: '', status: 'ACTIVE', notes: '' });
    }
    setInsForm(policy || {});
  };
  const saveIns = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      const data = { ...insFormData, person_id: id };
      if (insForm._id) await api.put(`/erp/insurance/${insForm._id}`, data);
      else await api.post('/erp/insurance', data);
      setInsForm(null);
      load();
    } catch (err) { showError(err, 'Could not save compensation profile'); }
    finally { savingRef.current = false; }
  };
  const deleteIns = async (policyId) => {
    if (!confirm('Delete this insurance policy?')) return;
    try { await api.delete(`/erp/insurance/${policyId}`); load(); }
    catch (err) { showError(err, 'Could not delete insurance record'); }
  };

  // ── Export All (Person + Comp + Insurance → multi-sheet Excel) ──
  const exportAll = () => {
    const wb = XLSX.utils.book_new();
    const name = person?.full_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'person';

    // Sheet 1: Person Info
    const personRows = [
      ['Field', 'Value'],
      ['Full Name', person.full_name], ['First Name', person.first_name], ['Last Name', person.last_name],
      ['Person Type', person.person_type], ['Position', person.position], ['Department', person.department],
      ['Employment Type', person.employment_type], ['Status', person.status],
      ['Date Hired', toInput(person.date_hired)], ['Date Regularized', toInput(person.date_regularized)],
      ['Date Separated', toInput(person.date_separated)], ['Date of Birth', toInput(person.date_of_birth)],
      ['Civil Status', person.civil_status],
      ['SSS No.', person.government_ids?.sss_no || ''], ['PhilHealth No.', person.government_ids?.philhealth_no || ''],
      ['Pag-IBIG No.', person.government_ids?.pagibig_no || ''], ['TIN', person.government_ids?.tin || ''],
      ['Bank', person.bank_account?.bank || ''], ['Account No.', person.bank_account?.account_no || ''],
      ['Account Name', person.bank_account?.account_name || ''],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(personRows);
    ws1['!cols'] = [{ wch: 20 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Person Info');

    // Sheet 2: Comp Profile
    if (comp) {
      const compRows = [
        ['Field', 'Value'],
        ['Salary Type', comp.salary_type], ['Effective Date', toInput(comp.effective_date)], ['Tax Status', comp.tax_status],
        ['Basic Salary', comp.basic_salary], ['Rice Allowance', comp.rice_allowance], ['Clothing', comp.clothing_allowance],
        ['Medical', comp.medical_allowance], ['Laundry', comp.laundry_allowance], ['Transport', comp.transport_allowance],
        ['Monthly Gross', comp.monthly_gross],
        ['Incentive Type', comp.incentive_type], ['Incentive Rate', comp.incentive_rate], ['Incentive Cap', comp.incentive_cap],
        ['Per Diem Rate', comp.perdiem_rate], ['Per Diem Days', comp.perdiem_days], ['Vehicle Type', comp.vehicle_type],
        ['Km/Liter', comp.km_per_liter], ['Fuel Threshold', comp.fuel_overconsumption_threshold],
        ['Commission Rate', comp.commission_rate], ['Profit Share Eligible', comp.profit_share_eligible ? 'Yes' : 'No'],
        ['SMER Eligible', comp.smer_eligible ? 'Yes' : 'No'], ['Logbook Eligible', comp.logbook_eligible ? 'Yes' : 'No'],
        ['ORE Eligible', comp.ore_eligible ? 'Yes' : 'No'], ['ACCESS Eligible', comp.access_eligible ? 'Yes' : 'No'],
        ['CALF Override', comp.calf_override ? 'Yes' : 'No'], ['CRM Linked', comp.crm_linked ? 'Yes' : 'No'],
      ];
      const ws2 = XLSX.utils.aoa_to_sheet(compRows);
      ws2['!cols'] = [{ wch: 22 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'Comp Profile');
    }

    // Sheet 3: Insurance
    if (insurance.length) {
      const insHeaders = ['Policy Type', 'Provider', 'Policy No.', 'Coverage', 'Premium', 'Frequency', 'Effective', 'Expiry', 'Beneficiary', 'Plate No.', 'Vehicle', 'Status', 'Notes'];
      const insRows = insurance.map(p => [p.policy_type, p.provider, p.policy_no, p.coverage_amount, p.premium_amount, p.premium_frequency, toInput(p.effective_date), toInput(p.expiry_date), p.beneficiary || '', p.vehicle_plate_no || '', p.vehicle_description || '', p.status, p.notes || '']);
      const ws3 = XLSX.utils.aoa_to_sheet([insHeaders, ...insRows]);
      ws3['!cols'] = insHeaders.map(() => ({ wch: 18 }));
      XLSX.utils.book_append_sheet(wb, ws3, 'Insurance');
    }

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `PersonDetail_${name}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Insurance Excel Export ──
  const exportInsurance = () => {
    const headers = ['Policy Type', 'Provider', 'Policy No.', 'Coverage Amount', 'Premium Amount', 'Premium Frequency', 'Effective Date', 'Expiry Date', 'Beneficiary', 'Plate No.', 'Vehicle Description', 'Status', 'Notes'];
    const rows = insurance.map(p => [
      p.policy_type, p.provider, p.policy_no, p.coverage_amount, p.premium_amount,
      p.premium_frequency, toInput(p.effective_date), toInput(p.expiry_date),
      p.beneficiary || '', p.vehicle_plate_no || '', p.vehicle_description || '', p.status, p.notes || ''
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Insurance');
    const name = person?.full_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'person';
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Insurance_${name}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Insurance Excel Import ──
  const importInsFileRef = useRef(null);
  const handleImportInsurance = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const data = await file.arrayBuffer();
      const wb = safeXlsxRead(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);
      let imported = 0;
      for (const row of rows) {
        const policyData = {
          person_id: id,
          policy_type: row['Policy Type'] || row.policy_type || 'LIFE',
          provider: row['Provider'] || row.provider || '',
          policy_no: row['Policy No.'] || row.policy_no || '',
          coverage_amount: Number(row['Coverage Amount'] || row.coverage_amount || 0),
          premium_amount: Number(row['Premium Amount'] || row.premium_amount || 0),
          premium_frequency: row['Premium Frequency'] || row.premium_frequency || 'ANNUAL',
          effective_date: row['Effective Date'] || row.effective_date || null,
          expiry_date: row['Expiry Date'] || row.expiry_date || null,
          beneficiary: row['Beneficiary'] || row.beneficiary || '',
          vehicle_plate_no: row['Plate No.'] || row.vehicle_plate_no || '',
          vehicle_description: row['Vehicle Description'] || row.vehicle_description || '',
          status: row['Status'] || row.status || 'ACTIVE',
          notes: row['Notes'] || row.notes || '',
        };
        if (!policyData.provider) continue;
        await api.post('/erp/insurance', policyData);
        imported++;
      }
      showSuccess(`Imported ${imported} insurance policy(ies)`);
      load();
    } catch (err) { showError(err, 'Insurance import failed — check file format'); }
  };

  if (loading) return <div className="admin-page erp-page pd-page"><Navbar /><div className="admin-layout"><Sidebar /><main className="pd-main"><div className="pd-empty">Loading...</div></main></div></div>;
  if (!person) return <div className="admin-page erp-page pd-page"><Navbar /><div className="admin-layout"><Sidebar /><main className="pd-main"><div className="pd-empty">Person not found</div></main></div></div>;

  const comp = person.comp_profile;

  return (
    <div className="admin-page erp-page pd-page">
      <style>{css}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="pd-main">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className="pd-back" style={{ marginBottom: 0 }} onClick={() => navigate('/erp/people')}>← Back to People</span>
            <button className="pd-btn" onClick={exportAll}>Export All to Excel</button>
          </div>
          <WorkflowGuide pageKey="person-detail" />

          {/* ═��═ SECTION A: Person Info ═══ */}
          <div className="pd-card">
            <div className="pd-card-hdr">
              <h3>{person.full_name}</h3>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {canEdit && !editPerson && <button className="pd-btn" onClick={() => setEditPerson(true)}>Edit</button>}
                {editPerson && <><button className="pd-btn pd-btn-p" onClick={savePerson}>Save</button><button className="pd-btn" onClick={() => setEditPerson(false)}>Cancel</button></>}
                {canEdit && !editPerson && !(person.status === 'SEPARATED' && person.is_active === false) && (
                  <button className="pd-btn" style={{ fontSize: 11, color: '#dc2626', border: '1px solid #fecaca', background: '#fef2f2' }}
                    onClick={async () => {
                      if (!window.confirm('Separate this employee? This will:\n- Mark status as SEPARATED\n- Deactivate all functional role assignments\n- Disable their system login\n\nContinue?')) return;
                      try {
                        const res = await pplApi.separatePerson(id);
                        const d = res?.data || {};
                        showSuccess(`${person.full_name} separated — ${d.roles_revoked || 0} role(s) revoked${d.login_disabled ? ', login disabled' : ''}`);
                        load();
                      } catch (err) { showError(err, 'Could not separate person'); }
                    }}>Separate Employee</button>
                )}
                {canEdit && !editPerson && person.status === 'SEPARATED' && person.is_active === false && (
                  <button className="pd-btn" style={{ fontSize: 11, color: '#166534', border: '1px solid #bbf7d0', background: '#dcfce7' }}
                    onClick={async () => {
                      if (!window.confirm('Reactivate this person? Their status will be set to ACTIVE.\nYou will need to manually re-enable login and role assignments if needed.')) return;
                      try {
                        await pplApi.reactivatePerson(id);
                        showSuccess(`${person.full_name} reactivated`);
                        load();
                      } catch (err) { showError(err, 'Could not reactivate'); }
                    }}>Reactivate</button>
                )}
              </div>
            </div>
            <div className="pd-grid">
              <F lbl="First Name" name="first_name" val={person.first_name} editing={editPerson} form={personForm} onChange={handlePersonChange} />
              <F lbl="Last Name" name="last_name" val={person.last_name} editing={editPerson} form={personForm} onChange={handlePersonChange} />
              <F lbl="Email" name="email" val={person.email} editing={editPerson} form={personForm} onChange={handlePersonChange} />
              <F lbl="Phone" name="phone" val={person.phone} editing={editPerson} form={personForm} onChange={handlePersonChange} />
              <F lbl="Person Type" name="person_type" val={person.person_type?.replace(/_/g, ' ')} editing={editPerson} form={personForm} onChange={handlePersonChange} options={PERSON_TYPES} />
              <F lbl="Status" name="status" val={person.status} editing={editPerson} form={personForm} onChange={handlePersonChange} options={PERSON_STATUSES} />
              <F lbl="Position" name="position" val={person.position} editing={editPerson} form={personForm} onChange={handlePersonChange} />
              <F lbl="Department" name="department" val={person.department} editing={editPerson} form={personForm} onChange={handlePersonChange} />
              {/* Reports To — custom dropdown (needs object options, not strings) */}
              <div className="pd-field">
                <div className="lbl">Reports To</div>
                {editPerson ? (
                  <select name="reports_to" value={personForm.reports_to || ''} onChange={handlePersonChange}>
                    <option value="">None (Top Level)</option>
                    {allPeople.filter(p => p._id !== id).map(p => (
                      <option key={p._id} value={p._id}>{p.full_name}{p.position ? ` — ${p.position}` : ''}</option>
                    ))}
                  </select>
                ) : (
                  <div className="val">{person.reports_to?.full_name ? `${person.reports_to.full_name}${person.reports_to.position ? ` — ${person.reports_to.position}` : ''}` : '—'}</div>
                )}
              </div>
              <F lbl="BDM Stage" name="bdm_stage" val={person.bdm_stage} editing={editPerson} form={personForm} onChange={handlePersonChange} options={BDM_STAGES} />
              <F lbl="ERP Live Date" name="live_date" type="date" val={fmtDate(person.live_date)} editing={editPerson} form={personForm} onChange={handlePersonChange} />
              <F lbl="Employment Type" name="employment_type" val={person.employment_type} editing={editPerson} form={personForm} onChange={handlePersonChange} options={EMP_TYPES} />
              <F lbl="Civil Status" name="civil_status" val={person.civil_status} editing={editPerson} form={personForm} onChange={handlePersonChange} options={CIVIL_STATUSES} />
              <F lbl="Date Hired" name="date_hired" type="date" val={fmtDate(person.date_hired)} editing={editPerson} form={personForm} onChange={handlePersonChange} />
              <F lbl="Date Regularized" name="date_regularized" type="date" val={fmtDate(person.date_regularized)} editing={editPerson} form={personForm} onChange={handlePersonChange} />
              <F lbl="Date Separated" name="date_separated" type="date" val={fmtDate(person.date_separated)} editing={editPerson} form={personForm} onChange={handlePersonChange} />
              <F lbl="Date of Birth" name="date_of_birth" type="date" val={fmtDate(person.date_of_birth)} editing={editPerson} form={personForm} onChange={handlePersonChange} />
            </div>
            {/* Gov IDs + Bank */}
            <hr className="pd-sep" />
            <div className="pd-grid">
              <F lbl="SSS No." name="government_ids.sss_no" val={person.government_ids?.sss_no} editing={editPerson} form={personForm} onChange={handlePersonChange} />
              <F lbl="PhilHealth No." name="government_ids.philhealth_no" val={person.government_ids?.philhealth_no} editing={editPerson} form={personForm} onChange={handlePersonChange} />
              <F lbl="Pag-IBIG No." name="government_ids.pagibig_no" val={person.government_ids?.pagibig_no} editing={editPerson} form={personForm} onChange={handlePersonChange} />
              <F lbl="TIN" name="government_ids.tin" val={person.government_ids?.tin} editing={editPerson} form={personForm} onChange={handlePersonChange} />
            </div>
            <hr className="pd-sep" />
            <div className="pd-grid3">
              <F lbl="Bank" name="bank_account.bank" val={person.bank_account?.bank} editing={editPerson} form={personForm} onChange={handlePersonChange} />
              <F lbl="Account No." name="bank_account.account_no" val={person.bank_account?.account_no} editing={editPerson} form={personForm} onChange={handlePersonChange} />
              <F lbl="Account Name" name="bank_account.account_name" val={person.bank_account?.account_name} editing={editPerson} form={personForm} onChange={handlePersonChange} />
            </div>
          </div>

          {/* ═══ SECTION B: Compensation Profile ═══ */}
          <div className="pd-card">
            <div className="pd-card-hdr">
              <h3>Compensation Profile</h3>
              {canEdit && !editComp && <button className="pd-btn" onClick={() => setEditComp(true)}>{comp ? 'Edit' : 'Create'}</button>}
              {editComp && <div style={{ display: 'flex', gap: 6 }}><button className="pd-btn pd-btn-p" onClick={saveComp}>Save</button><button className="pd-btn" onClick={() => setEditComp(false)}>Cancel</button></div>}
            </div>
            {(comp || editComp) ? (
              <>
                <div className="pd-grid">
                  <F lbl="Salary Type" name="salary_type" val={comp?.salary_type?.replace(/_/g, ' ')} editing={editComp} form={compForm} onChange={handleCompChange} options={SALARY_TYPES} />
                  <F lbl="Effective Date" name="effective_date" type="date" val={fmtDate(comp?.effective_date)} editing={editComp} form={compForm} onChange={handleCompChange} />
                  <F lbl="Tax Status" name="tax_status" val={comp?.tax_status} editing={editComp} form={compForm} onChange={handleCompChange} options={TAX_STATUSES} />
                  <F lbl="Monthly Gross" val={fmt(comp?.monthly_gross)} editing={false} form={{}} onChange={() => {}} />
                </div>
                <hr className="pd-sep" />
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--erp-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>Salary & Allowances</div>
                <div className="pd-grid3">
                  <F lbl="Basic Salary" name="basic_salary" type="number" val={fmt(comp?.basic_salary)} editing={editComp} form={compForm} onChange={handleCompChange} />
                  <F lbl="Rice" name="rice_allowance" type="number" val={fmt(comp?.rice_allowance)} editing={editComp} form={compForm} onChange={handleCompChange} />
                  <F lbl="Clothing" name="clothing_allowance" type="number" val={fmt(comp?.clothing_allowance)} editing={editComp} form={compForm} onChange={handleCompChange} />
                  <F lbl="Medical" name="medical_allowance" type="number" val={fmt(comp?.medical_allowance)} editing={editComp} form={compForm} onChange={handleCompChange} />
                  <F lbl="Laundry" name="laundry_allowance" type="number" val={fmt(comp?.laundry_allowance)} editing={editComp} form={compForm} onChange={handleCompChange} />
                  <F lbl="Transport" name="transport_allowance" type="number" val={fmt(comp?.transport_allowance)} editing={editComp} form={compForm} onChange={handleCompChange} />
                </div>
                <hr className="pd-sep" />
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--erp-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>Incentives</div>
                <div className="pd-grid">
                  <F lbl="Incentive Type" name="incentive_type" val={comp?.incentive_type} editing={editComp} form={compForm} onChange={handleCompChange} options={INCENTIVE_TYPES} />
                  <F lbl="Incentive Rate (%)" name="incentive_rate" type="number" val={comp?.incentive_rate} editing={editComp} form={compForm} onChange={handleCompChange} />
                  <F lbl="Description" name="incentive_description" val={comp?.incentive_description} editing={editComp} form={compForm} onChange={handleCompChange} />
                  <F lbl="Cap" name="incentive_cap" type="number" val={fmt(comp?.incentive_cap)} editing={editComp} form={compForm} onChange={handleCompChange} />
                </div>
                <hr className="pd-sep" />
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--erp-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>BDM / Field</div>
                <div className="pd-grid3">
                  <F lbl="Per Diem Rate" name="perdiem_rate" type="number" val={fmt(comp?.perdiem_rate)} editing={editComp} form={compForm} onChange={handleCompChange} />
                  <F lbl="Per Diem Days" name="perdiem_days" type="number" val={comp?.perdiem_days} editing={editComp} form={compForm} onChange={handleCompChange} />
                  <F lbl="Vehicle Type" name="vehicle_type" val={comp?.vehicle_type} editing={editComp} form={compForm} onChange={handleCompChange} options={VEHICLE_TYPES} />
                  <F lbl="Km/Liter" name="km_per_liter" type="number" val={comp?.km_per_liter} editing={editComp} form={compForm} onChange={handleCompChange} />
                  <F lbl="Fuel Overcon. Threshold" name="fuel_overconsumption_threshold" type="number" val={comp?.fuel_overconsumption_threshold} editing={editComp} form={compForm} onChange={handleCompChange} />
                  <F lbl="Commission Rate (%)" name="commission_rate" type="number" val={comp?.commission_rate} editing={editComp} form={compForm} onChange={handleCompChange} />
                  <F lbl="Full Threshold" name="perdiem_engagement_threshold_full" type="number" val={comp?.perdiem_engagement_threshold_full} editing={editComp} form={compForm} onChange={handleCompChange} />
                  <F lbl="Half Threshold" name="perdiem_engagement_threshold_half" type="number" val={comp?.perdiem_engagement_threshold_half} editing={editComp} form={compForm} onChange={handleCompChange} />
                </div>
                <hr className="pd-sep" />
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--erp-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>Eligibility Flags</div>
                <div className="pd-grid3">
                  <F lbl="SMER Eligible" name="smer_eligible" type="checkbox" val={comp?.smer_eligible ? 'Yes' : 'No'} editing={editComp} form={compForm} onChange={handleCompChange} />
                  <F lbl="Logbook Eligible" name="logbook_eligible" type="checkbox" val={comp?.logbook_eligible ? 'Yes' : 'No'} editing={editComp} form={compForm} onChange={handleCompChange} />
                  <F lbl="ORE Eligible" name="ore_eligible" type="checkbox" val={comp?.ore_eligible ? 'Yes' : 'No'} editing={editComp} form={compForm} onChange={handleCompChange} />
                  <F lbl="ACCESS Eligible" name="access_eligible" type="checkbox" val={comp?.access_eligible ? 'Yes' : 'No'} editing={editComp} form={compForm} onChange={handleCompChange} />
                  <F lbl="CALF Override" name="calf_override" type="checkbox" val={comp?.calf_override ? 'Yes' : 'No'} editing={editComp} form={compForm} onChange={handleCompChange} />
                  <F lbl="CRM Linked" name="crm_linked" type="checkbox" val={comp?.crm_linked ? 'Yes' : 'No'} editing={editComp} form={compForm} onChange={handleCompChange} />
                  <F lbl="Profit Share Eligible" name="profit_share_eligible" type="checkbox" val={comp?.profit_share_eligible ? 'Yes' : 'No'} editing={editComp} form={compForm} onChange={handleCompChange} />
                </div>
                {editComp && (
                  <div style={{ marginTop: 12 }}>
                    <F lbl="Reason for Change" name="reason" val="" editing={true} form={compForm} onChange={handleCompChange} />
                  </div>
                )}
              </>
            ) : (
              <div className="pd-empty">No compensation profile set</div>
            )}
          </div>

          {/* ═══ SECTION C: Insurance Register ═══ */}
          <div className="pd-card">
            <div className="pd-card-hdr">
              <h3>Insurance Policies</h3>
              <div style={{ display: 'flex', gap: 6 }}>
                {insurance.length > 0 && <button className="pd-btn" onClick={exportInsurance}>Export</button>}
                {canEdit && <button className="pd-btn" onClick={() => importInsFileRef.current?.click()}>Import</button>}
                {canEdit && <button className="pd-btn pd-btn-p" onClick={() => openInsForm(null)}>+ Add Policy</button>}
                <input ref={importInsFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportInsurance} />
              </div>
            </div>
            {insurance.length ? insurance.map(p => (
              <div key={p._id} className="pd-ins-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div className="pd-ins-type">{p.policy_type.replace(/_/g, ' ')}</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <span className="badge" style={{ background: p.status === 'ACTIVE' ? '#dcfce7' : p.status === 'EXPIRED' ? '#fee2e2' : '#fef3c7', color: p.status === 'ACTIVE' ? '#166534' : p.status === 'EXPIRED' ? '#dc2626' : '#92400e' }}>{p.status}</span>
                    {canEdit && <button className="pd-btn" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => openInsForm(p)}>Edit</button>}
                    {isPresident && <button className="pd-btn pd-btn-d" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => deleteIns(p._id)}>Del</button>}
                  </div>
                </div>
                <div className="pd-grid">
                  <div className="pd-field"><div className="lbl">Provider</div><div className="val">{p.provider}</div></div>
                  <div className="pd-field"><div className="lbl">Policy No.</div><div className="val">{p.policy_no || '—'}</div></div>
                  <div className="pd-field"><div className="lbl">Coverage</div><div className="val">{fmt(p.coverage_amount)}</div></div>
                  <div className="pd-field"><div className="lbl">Premium</div><div className="val">{fmt(p.premium_amount)} / {p.premium_frequency}</div></div>
                  <div className="pd-field"><div className="lbl">Effective</div><div className="val">{fmtDate(p.effective_date)}</div></div>
                  <div className="pd-field"><div className="lbl">Expiry</div><div className="val" style={{ color: p.expiry_date && new Date(p.expiry_date) < new Date(Date.now() + 30*86400000) ? '#dc2626' : undefined, fontWeight: p.expiry_date && new Date(p.expiry_date) < new Date(Date.now() + 30*86400000) ? 600 : undefined }}>{fmtDate(p.expiry_date)}</div></div>
                  {p.beneficiary && <div className="pd-field"><div className="lbl">Beneficiary</div><div className="val">{p.beneficiary}</div></div>}
                  {p.vehicle_plate_no && <div className="pd-field"><div className="lbl">Plate No.</div><div className="val">{p.vehicle_plate_no}</div></div>}
                  {p.vehicle_description && <div className="pd-field"><div className="lbl">Vehicle</div><div className="val">{p.vehicle_description}</div></div>}
                  {p.notes && <div className="pd-field"><div className="lbl">Notes</div><div className="val">{p.notes}</div></div>}
                </div>
              </div>
            )) : <div className="pd-empty">No insurance policies</div>}

            {/* Insurance Form Modal */}
            {insForm !== null && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setInsForm(null)}>
                <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 500, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>{insForm._id ? 'Edit' : 'Add'} Insurance Policy</h3>
                  <div className="pd-grid">
                    <div className="pd-field"><div className="lbl">Policy Type</div><select name="policy_type" value={insFormData.policy_type || ''} onChange={handleInsChange}>{INS_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select></div>
                    <div className="pd-field"><div className="lbl">Status</div><select name="status" value={insFormData.status || ''} onChange={handleInsChange}>{INS_STATUS.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                    <div className="pd-field"><div className="lbl">Provider</div><input name="provider" value={insFormData.provider || ''} onChange={handleInsChange} /></div>
                    <div className="pd-field"><div className="lbl">Policy No.</div><input name="policy_no" value={insFormData.policy_no || ''} onChange={handleInsChange} /></div>
                    <div className="pd-field"><div className="lbl">Coverage Amount</div><input type="number" name="coverage_amount" value={insFormData.coverage_amount || ''} onChange={handleInsChange} /></div>
                    <div className="pd-field"><div className="lbl">Premium Amount</div><input type="number" name="premium_amount" value={insFormData.premium_amount || ''} onChange={handleInsChange} /></div>
                    <div className="pd-field"><div className="lbl">Premium Frequency</div><select name="premium_frequency" value={insFormData.premium_frequency || ''} onChange={handleInsChange}>{INS_FREQ.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                    <div className="pd-field"><div className="lbl">Effective Date</div><input type="date" name="effective_date" value={insFormData.effective_date || ''} onChange={handleInsChange} /></div>
                    <div className="pd-field"><div className="lbl">Expiry Date</div><input type="date" name="expiry_date" value={insFormData.expiry_date || ''} onChange={handleInsChange} /></div>
                    <div className="pd-field"><div className="lbl">Beneficiary</div><input name="beneficiary" value={insFormData.beneficiary || ''} onChange={handleInsChange} /></div>
                    {(insFormData.policy_type || '').includes('VEHICLE') && (
                      <>
                        <div className="pd-field"><div className="lbl">Plate No.</div><input name="vehicle_plate_no" value={insFormData.vehicle_plate_no || ''} onChange={handleInsChange} /></div>
                        <div className="pd-field"><div className="lbl">Vehicle Description</div><input name="vehicle_description" value={insFormData.vehicle_description || ''} onChange={handleInsChange} /></div>
                      </>
                    )}
                  </div>
                  <div className="pd-field" style={{ marginTop: 8 }}><div className="lbl">Notes</div><input name="notes" value={insFormData.notes || ''} onChange={handleInsChange} /></div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                    <button className="pd-btn" onClick={() => setInsForm(null)}>Cancel</button>
                    <button className="pd-btn pd-btn-p" onClick={saveIns}>Save</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ═══ SECTION D: ERP Module Access / Create Login ═══ */}
          {person.user_id ? (
            <div className="pd-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>ERP Module Access</h3>
                {canEdit && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {person.user_id?.isActive === false ? (
                      <button
                        className="pd-btn"
                        style={{ fontSize: 11, color: '#166534', border: '1px solid #bbf7d0', background: '#f0fdf4' }}
                        onClick={async () => {
                          if (!confirm('Re-enable this person\'s login?')) return;
                          try { await pplApi.enableLogin(id); showSuccess('Login re-enabled.'); load(); }
                          catch (err) { showError(err, 'Could not re-enable login'); }
                        }}
                      >Enable Login</button>
                    ) : (
                      <button
                        className="pd-btn"
                        style={{ fontSize: 11, color: '#dc2626', border: '1px solid #fecaca', background: '#fef2f2' }}
                        onClick={async () => {
                          if (!confirm('Disable this person\'s login? They will no longer be able to log in.')) return;
                          try { await pplApi.disableLogin(id); showSuccess('Login disabled.'); load(); }
                          catch (err) { showError(err, 'Could not disable login'); }
                        }}
                      >Disable Login</button>
                    )}
                    <button
                      className="pd-btn"
                      style={{ fontSize: 11, color: '#64748b', border: '1px solid #e5e7eb' }}
                      onClick={async () => {
                        if (!confirm('Unlink login? CRM User stays but disconnects from this person record. Use this if the login was linked by mistake.')) return;
                        try { await pplApi.unlinkLogin(id); showSuccess('Login unlinked.'); load(); }
                        catch (err) { showError(err, 'Could not unlink login'); }
                      }}
                    >Unlink Login</button>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                Linked to CRM User: {person.user_id?.email || person.user_id?._id || person.user_id}
                {person.user_id?.isActive === false && <span style={{ color: '#dc2626', fontWeight: 600 }}> (DISABLED)</span>}
              </div>
              {/* System Role display + change */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '8px 12px', background: 'var(--erp-accent-soft, #e8efff)', borderRadius: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--erp-muted)', minWidth: 90 }}>System Role</span>
                {canEdit ? (
                  <select
                    value={person.user_id?.role || ''}
                    onChange={async (e) => {
                      const newRole = e.target.value;
                      if (!newRole || newRole === person.user_id?.role) return;
                      try {
                        await pplApi.changeSystemRole(id, newRole);
                        const roleLabel = systemRoleOpts.find(r => r.code.toLowerCase() === newRole)?.label || newRole;
                        showSuccess(`System role changed to ${roleLabel}`);
                        load();
                      } catch (err) { showError(err, 'Could not change system role'); }
                    }}
                    style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--erp-border, #d1d5db)', fontSize: 13, minWidth: 160 }}
                  >
                    {systemRoleOpts.length > 0 ? systemRoleOpts.map(r => (
                      <option key={r.code} value={r.code.toLowerCase()}>{r.label} ({r.code.toLowerCase()})</option>
                    )) : (
                      <option value={person.user_id?.role || ''}>{person.user_id?.role || '—'}</option>
                    )}
                  </select>
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--erp-text)' }}>
                    {systemRoleOpts.find(r => r.code.toLowerCase() === person.user_id?.role)?.label || person.user_id?.role || '—'}
                  </span>
                )}
                {/* Mismatch indicator */}
                {person.person_type && roleMappingOpts.length > 0 && (() => {
                  const expected = getMappedRole(person.person_type);
                  const actual = person.user_id?.role;
                  if (expected && actual && expected !== actual) {
                    return <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>⚠ Expected &quot;{expected}&quot; for {person.person_type}</span>;
                  }
                  return null;
                })()}
              </div>
              <ErpAccessManager userId={person.user_id?._id || person.user_id} readOnly={!canEdit} />
            </div>
          ) : canEdit && (
            <div className="pd-card">
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>System Login</h3>
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>
                This person has no system login. Create one so they can log in to CRM/ERP.
              </p>
              {!showLoginForm ? (
                <button className="pd-btn pd-btn-p" onClick={() => {
                  const mapped = getMappedRole(person.person_type);
                  setLoginForm(f => ({ ...f, role: mapped }));
                  setShowLoginForm(true);
                }}>Create Login</button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>
                  <input placeholder="Email *" value={loginForm.email} onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))} style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
                  <input type="password" placeholder="Password * (min 8, upper+lower+number+special)" value={loginForm.password} onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))} style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>System Role</div>
                    <select value={loginForm.role} onChange={e => setLoginForm(f => ({ ...f, role: e.target.value }))} style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}>
                      {systemRoleOpts.length > 0 ? systemRoleOpts.map(r => (
                        <option key={r.code} value={r.code.toLowerCase()}>{r.label} ({r.code.toLowerCase()})</option>
                      )) : (
                        <option value="contractor">Contractor</option>
                      )}
                    </select>
                    {person.person_type && (
                      <p style={{ fontSize: 11, color: '#6b7280', margin: '4px 0 0' }}>Auto-mapped from {person.person_type} via Role Mapping lookup</p>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>ERP Access Template</div>
                    <select value={loginForm.template_id} onChange={e => setLoginForm(f => ({ ...f, template_id: e.target.value }))} style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}>
                      <option value="">— No template (configure later) —</option>
                      {accessTemplates.map(t => <option key={t._id} value={t._id}>{t.template_name}{t.description ? ` — ${t.description}` : ''}</option>)}
                    </select>
                  </div>
                  {!loginForm.template_id && (
                    <p style={{ fontSize: 11, color: '#f59e0b', margin: 0 }}>Warning: Without a template, this user will have no ERP module access.</p>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="pd-btn pd-btn-p" disabled={!loginForm.email || !loginForm.password} onClick={handleCreateLogin}>Create</button>
                    <button className="pd-btn" onClick={() => setShowLoginForm(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ SECTION E: History ═══ */}
          {person.comp_history?.length > 0 && (
            <div className="pd-card">
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Compensation History</h3>
              <table className="pd-tbl">
                <thead><tr><th>Effective</th><th>Type</th><th>Basic</th><th>Gross</th><th>Status</th></tr></thead>
                <tbody>
                  {person.comp_history.map((c) => (
                    <tr key={c._id || c.effective_date}>
                      <td>{fmtDate(c.effective_date)}</td>
                      <td>{c.salary_type?.replace(/_/g, ' ')}</td>
                      <td>{fmt(c.basic_salary)}</td>
                      <td>{fmt(c.monthly_gross)}</td>
                      <td>{c.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="pd-card">
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Payslip History</h3>
            {payslips.length ? (
              <table className="pd-tbl">
                <thead><tr><th>Period</th><th>Cycle</th><th>Gross</th><th>Deductions</th><th>Net Pay</th><th>Status</th></tr></thead>
                <tbody>
                  {payslips.map(ps => (
                    <tr key={ps._id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/erp/payslip/${ps._id}`)}>
                      <td>{ps.period}</td>
                      <td>{ps.cycle}</td>
                      <td>{fmt(ps.total_earnings)}</td>
                      <td>{fmt(ps.total_deductions)}</td>
                      <td style={{ fontWeight: 600 }}>{fmt(ps.net_pay)}</td>
                      <td><span className="badge" style={{ background: ps.status === 'POSTED' ? '#dcfce7' : '#fef3c7', color: ps.status === 'POSTED' ? '#166534' : '#92400e' }}>{ps.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="pd-empty">No payslips yet</div>}
          </div>

          {/* ═══ SECTION F: Cross-Entity Functional Role Assignments ═══ */}
          <div className="pd-card">
            <div className="pd-card-hdr">
              <h3>Cross-Entity Assignments</h3>
              {canEdit && (
                <a href={`/erp/role-assignments?person=${id}`} style={{ fontSize: 12, color: 'var(--erp-accent, #1e5eff)', textDecoration: 'none' }}>+ Assign Role</a>
              )}
            </div>
            {funcRoleAssignments.length > 0 ? (
              <table className="pd-tbl">
                <thead>
                  <tr>
                    <th>Entity</th>
                    <th>Function</th>
                    <th>Period</th>
                    <th>Limit</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {funcRoleAssignments.map(a => (
                    <tr key={a._id}>
                      <td>{a.entity_id?.short_name || a.entity_id?.entity_name || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{a.functional_role}</td>
                      <td style={{ fontSize: 11 }}>{fmtDate(a.valid_from)} — {a.valid_to ? fmtDate(a.valid_to) : 'Permanent'}</td>
                      <td>{a.approval_limit != null ? `₱${Number(a.approval_limit).toLocaleString()}` : '—'}</td>
                      <td>
                        <span className="badge" style={{
                          background: a.status === 'ACTIVE' ? '#dcfce7' : a.status === 'SUSPENDED' ? '#fef3c7' : a.status === 'EXPIRED' ? '#f1f5f9' : '#fee2e2',
                          color: a.status === 'ACTIVE' ? '#166534' : a.status === 'SUSPENDED' ? '#92400e' : a.status === 'EXPIRED' ? '#475569' : '#991b1b',
                        }}>{a.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="pd-empty">No cross-entity assignments</div>}
          </div>

          {/* ═══ SECTION G: KPI Self-Rating Summary (Phase 32) ═══ */}
          <div className="pd-card">
            <div className="pd-card-hdr">
              <h3>Performance Rating</h3>
              <a href={`/erp/self-rating?person=${id}`} style={{ fontSize: 12, color: 'var(--erp-accent, #1e5eff)', textDecoration: 'none' }}>View All →</a>
            </div>
            {latestRating ? (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <div className="pd-field">
                    <div className="lbl">Period</div>
                    <div className="val" style={{ fontWeight: 600 }}>{latestRating.period} ({latestRating.period_type})</div>
                  </div>
                  <div className="pd-field">
                    <div className="lbl">Status</div>
                    <div className="val">
                      <span className="badge" style={{
                        background: latestRating.status === 'APPROVED' ? '#dcfce7' : latestRating.status === 'SUBMITTED' ? '#dbeafe' : latestRating.status === 'REVIEWED' ? '#fef3c7' : latestRating.status === 'RETURNED' ? '#fee2e2' : '#f3f4f6',
                        color: latestRating.status === 'APPROVED' ? '#166534' : latestRating.status === 'SUBMITTED' ? '#1e40af' : latestRating.status === 'REVIEWED' ? '#92400e' : latestRating.status === 'RETURNED' ? '#991b1b' : '#374151',
                      }}>{latestRating.status}</span>
                    </div>
                  </div>
                  <div className="pd-field">
                    <div className="lbl">Self Score</div>
                    <div className="val" style={{ fontSize: 18, fontWeight: 700 }}>{latestRating.overall_self_score || '—'}<span style={{ fontSize: 12, fontWeight: 400 }}>/5</span></div>
                  </div>
                  <div className="pd-field">
                    <div className="lbl">Manager Score</div>
                    <div className="val" style={{ fontSize: 18, fontWeight: 700, color: '#1e40af' }}>{latestRating.overall_manager_score || '—'}<span style={{ fontSize: 12, fontWeight: 400 }}>/5</span></div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  KPIs: {latestRating.kpi_ratings?.filter(k => k.self_score).length || 0}/{latestRating.kpi_ratings?.length || 0} rated
                  {' · '}Competencies: {latestRating.competency_ratings?.filter(c => c.self_score).length || 0}/{latestRating.competency_ratings?.length || 0} rated
                </div>
              </div>
            ) : <div className="pd-empty">No performance ratings yet</div>}
          </div>

        </main>
      </div>
    </div>
  );
}
