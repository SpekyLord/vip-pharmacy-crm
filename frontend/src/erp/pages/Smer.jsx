import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useWorkingEntity from '../../hooks/useWorkingEntity';
import { ROLES, ROLE_SETS } from '../../constants/roles';
import useExpenses from '../hooks/useExpenses';
import useSettings from '../hooks/useSettings';
import useHospitals from '../hooks/useHospitals';
import useTransfers from '../hooks/useTransfers';
import SelectField from '../../components/common/Select';
import { useLookupOptions } from '../hooks/useLookups';
import { useRejectionConfig } from '../hooks/useRejectionConfig';
import WorkflowGuide from '../components/WorkflowGuide';
import RejectionBanner from '../components/RejectionBanner';
import { showError, showApprovalPending } from '../utils/errorToast';
// Phase G4.5f — proxy eligibility detection. When the user has
// expenses.smer_proxy ticked AND their role is in PROXY_ENTRY_ROLES.SMER,
// they can write to the currently selected BDM's SMER via body.assigned_to
// on save. Lookup-driven per Rule #3.
const STATUS_COLORS = {
  DRAFT: '#6b7280', VALID: '#22c55e', ERROR: '#ef4444', POSTED: '#2563eb', DELETION_REQUESTED: '#eab308'
};
const DAYS_OF_WEEK = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

// ── Mobile-responsive SMER styles ──
const smerMobileStyles = `
  @media (max-width: 768px) {
    .smer-desktop-grid { display: none !important; }
    .smer-mobile-cards { display: block !important; }
    .smer-summary-row { flex-direction: column; }
    .smer-summary-row > div { min-width: auto !important; flex: 1; }
    .smer-controls { flex-direction: column; gap: 8px !important; }
    .smer-controls > * { width: 100%; }
    .smer-controls select, .smer-controls input[type="month"] { width: 100%; }
  }
  @media (min-width: 769px) {
    .smer-mobile-cards { display: none !important; }
  }
  .smer-card {
    background: #fff;
    border: 1px solid var(--erp-border, #dbe4f0);
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 8px;
  }
  .smer-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid #f1f5f9;
  }
  .smer-card-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .smer-card-field label {
    display: block;
    font-size: 10px;
    color: var(--erp-muted, #5f7188);
    margin-bottom: 2px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .smer-card-field input, .smer-card-field select {
    width: 100%;
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid var(--erp-border, #dbe4f0);
    font-size: 14px;
  }
  .smer-card-field.full-width { grid-column: 1 / -1; }
  .hospital-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }
  .hospital-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 12px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    font-size: 11px;
    color: #1e40af;
  }
  .hospital-chip button {
    background: none;
    border: none;
    color: #93c5fd;
    cursor: pointer;
    font-size: 14px;
    padding: 0;
    line-height: 1;
  }
  .hospital-picker-dropdown {
    position: absolute;
    z-index: 50;
    background: #fff;
    border: 1px solid var(--erp-border, #dbe4f0);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    max-height: 200px;
    overflow-y: auto;
    width: 100%;
    left: 0;
    top: 100%;
    margin-top: 2px;
  }
  .hospital-picker-item {
    padding: 8px 12px;
    cursor: pointer;
    font-size: 13px;
    border-bottom: 1px solid #f8fafc;
  }
  .hospital-picker-item:hover { background: #f0f9ff; }
`;

// Timezone-safe date formatting (avoids UTC shift that causes day-1 bug in +08:00)
function formatLocalDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
// Display date as MM/DD/YYYY
function displayDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = String(isoDate).split('T')[0].split('-');
  return `${m}/${d}/${y}`;
}

export default function Smer() {
  const { user } = useAuth();
  // Working entity from the navbar entity switcher (X-Entity-Id header). The
  // BDM dropdown and SMER list must refetch when this changes — otherwise a
  // privileged/proxy caller who switches to MG-and-CO still sees only the
  // BDMs from their primary entity, blocking proxy file-on-behalf for the
  // target entity (May 5 2026 follow-up to G4.5f / G4.5ff).
  const { workingEntityId } = useWorkingEntity();
  const isPrivileged = ROLE_SETS.MANAGEMENT.includes(user?.role); // president/admin/finance
  const isBdm = user?.role === ROLES.CONTRACTOR;
  const { getBdmsByEntity } = useTransfers();
  // Phase G4.5f — proxy-eligible callers (admin/finance with expenses.smer_proxy
  // ticked, OR a contractor eBDM with the same sub-perm) can WRITE to the
  // selected BDM's SMER. President always eligible. Lookup-driven proxy-role
  // gate is evaluated on the backend; the frontend only needs the sub-perm
  // check to surface the UI.
  //
  // Direct sub_permissions read (NOT hasSubPermission) — proxy entry is an
  // explicit elevation that must NEVER be inherited from module=FULL. The
  // hasSubPermission FULL-fallback path silently grants every non-danger key
  // when sub_permissions is empty, which would render the proxy picker for
  // plain BDMs whose Access Template never ticked smer_proxy and then 403 on
  // the BDM-list fetch. Mirrors hasProxySubPermission in resolveOwnerScope.js.
  const canProxySmer = user?.role === ROLES.PRESIDENT
    || ((isPrivileged || isBdm) && !!user?.erp_access?.sub_permissions?.expenses?.smer_proxy);
  const { getSmerList, getSmerById, createSmer, updateSmer, deleteDraftSmer, validateSmer, submitSmer, reopenSmer, revertSmer, getSmerCrmMdCounts, getRevolvingFundAmount, getPerdiemConfig, overridePerdiemDay, loading } = useExpenses();
  const { settings } = useSettings();
  const { options: activityTypeOpts } = useLookupOptions('ACTIVITY_TYPE');
  const ACTIVITY_TYPES = activityTypeOpts.map(o => o.code);
  // Phase G4.5ee — activity-aware per-diem tier rule mirror. Backend resolves
  // these from ACTIVITY_PERDIEM_RULES Lookup; frontend mirrors so the preview
  // tier matches what postSmer will compute. When the lookup hasn't seeded
  // yet (or fails), we fall back to inline defaults so OFFICE → AUTO_FULL is
  // honored even on a brand-new entity. tier_rule semantics:
  //   AUTO_FULL       → 100% per-diem regardless of MD count (admin/office)
  //   AUTO_HALF       → 50% per-diem regardless of MD count (rare)
  //   ZERO            → 0% per-diem (no work, leave, holiday)
  //   USE_THRESHOLDS  → existing MD vs CompProfile/PERDIEM_RATES/Settings
  const { options: activityRuleOpts } = useLookupOptions('ACTIVITY_PERDIEM_RULES');
  const ACTIVITY_RULE_FALLBACK = useMemo(() => ({
    OFFICE: 'AUTO_FULL',
    FIELD: 'USE_THRESHOLDS',
    OTHER: 'USE_THRESHOLDS',
    NO_WORK: 'ZERO',
  }), []);
  const activityRuleByCode = useMemo(() => {
    const map = { ...ACTIVITY_RULE_FALLBACK };
    for (const r of activityRuleOpts || []) {
      const rule = r?.metadata?.tier_rule;
      if (rule && ['AUTO_FULL', 'AUTO_HALF', 'ZERO', 'USE_THRESHOLDS'].includes(String(rule).toUpperCase())) {
        map[String(r.code).toUpperCase()] = String(rule).toUpperCase();
      }
    }
    return map;
  }, [activityRuleOpts, ACTIVITY_RULE_FALLBACK]);

  // Lookup-driven rejection config (MODULE_REJECTION_CONFIG → SMER).
  // Drives which statuses can still be edited / re-submitted by the contractor.
  // Fallback preserves prior hardcoded behavior if the lookup is not yet seeded.
  const { config: rejectionConfig } = useRejectionConfig('SMER');
  const editableStatuses = rejectionConfig?.editable_statuses || ['DRAFT', 'ERROR'];

  const [smers, setSmers] = useState([]);
  const [editingSmer, setEditingSmer] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [cycle, setCycle] = useState('C1');
  const [listTab, setListTab] = useState('working');

  // ── Phase G4.5f — BDM picker for privileged + proxy callers ───────────
  // BDM selector — privileged viewers + proxy-eligible eBDMs. Plain BDMs are
  // self-scoped by backend tenantFilter and do not see this control. Rule #21:
  // no silent self-fallback; privileged starts empty until they explicitly pick.
  const [bdmOptions, setBdmOptions] = useState([]);
  const [selectedBdmId, setSelectedBdmId] = useState(() => (isBdm ? (user?._id || '') : ''));
  // Cycle-level authorization tag captured when proxy posts on behalf. Required
  // and non-empty after trim on the proxy submit path; ignored on self-file.
  const [bdmPhoneInstruction, setBdmPhoneInstruction] = useState('');
  // Viewing own SMER → writes allowed. Viewing someone else's (or no BDM picked
  // on a privileged account) → read-only unless proxy-eligible. Rule #21:
  // privileged without a selected BDM cannot submit (backend would 400 on
  // missing bdm_id under the new G4.5f scoping).
  const viewingSelf = !!selectedBdmId && selectedBdmId === user?._id;
  // Phase G4.5f — proxy write: eligible caller + a BDM selected (not self).
  // When true, writes send body.assigned_to = selectedBdmId so the backend
  // stamps bdm_id = target and records the proxy audit. Self-edits omit
  // assigned_to (self-file path). Admin/finance/president always need a BDM
  // selected because their role is not a valid SMER owner.
  const viewingOther = !!selectedBdmId && selectedBdmId !== user?._id;
  const canWriteOnBehalf = canProxySmer && viewingOther;
  const canWrite = viewingSelf || canWriteOnBehalf;

  // Form state
  const [dailyEntries, setDailyEntries] = useState([]);
  const [travelAdvance, setTravelAdvance] = useState(0);
  const [travelAdvanceSource, setTravelAdvanceSource] = useState('');  // 'COMP_PROFILE' | 'SETTINGS' | 'MANUAL'
  const [travelAdvanceOverride, setTravelAdvanceOverride] = useState(false);
  const [perdiemRate, setPerdiemRate] = useState(800);
  // Per diem thresholds: resolved from CompProfile (per-person) → Settings (global fallback).
  // eligibility_source + skip_flagged drive the Pull-from-CRM button label and
  // explain why a non-zero flagged_excluded count appears below it.
  const [perdiemThresholds, setPerdiemThresholds] = useState({ full: 8, half: 3, source: '', eligibility_source: 'visit', skip_flagged: false });

  // Hospital picker state
  const { hospitals } = useHospitals();
  const [hospitalSearch, setHospitalSearch] = useState('');
  const [activeHospitalPicker, setActiveHospitalPicker] = useState(null); // index of entry with open picker
  const hospitalPickerRef = useRef(null);

  // Close hospital picker on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (hospitalPickerRef.current && !hospitalPickerRef.current.contains(e.target)) {
        setActiveHospitalPicker(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const loadSmers = useCallback(async () => {
    // Privileged viewer with no BDM selected → show empty list (Rule #21:
    // no silent self-filter; the picker must be used to scope).
    if (isPrivileged && !selectedBdmId) { setSmers([]); return; }
    try {
      // Phase G4.5f — pass selectedBdmId so privileged + proxy callers scope to
      // one BDM. Self-filers omit it; backend self-scopes via tenantFilter AND
      // ignores any query override when scope is self-pinned (impersonation guard).
      const params = { period, cycle };
      if (selectedBdmId) params.bdm_id = selectedBdmId;
      const res = await getSmerList(params);
      setSmers(res?.data || []);
    } catch (err) { console.error('[SMER]', err.message); showError(err, 'Could not load SMER list'); }
    // workingEntityId in the dep set so the list refetches when the navbar
    // entity switcher fires; backend scopes by req.entityId from X-Entity-Id.
  }, [period, cycle, selectedBdmId, isPrivileged, workingEntityId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadSmers(); }, [loadSmers]);

  // Phase G4.5f — load BDM options for privileged viewers AND proxy-eligible
  // eBDMs. Plain BDMs without proxy still self-scope and skip this fetch.
  // Source the entity from the navbar entity switcher (workingEntityId) so a
  // proxy caller who switches to MG-and-CO sees MG-and-CO BDMs in the picker.
  // Falls back to user's primary entity for callers that haven't switched yet.
  useEffect(() => {
    if (!isPrivileged && !canProxySmer) return;
    const eid = workingEntityId || user?.entity_id || user?.entity_ids?.[0];
    if (!eid) return;
    (async () => {
      try {
        const r = await getBdmsByEntity(eid);
        setBdmOptions(r?.data || []);
      } catch (err) { console.error('[SMER] load BDMs:', err.message); }
    })();
  }, [isPrivileged, canProxySmer, workingEntityId, user?.entity_id, user?.entity_ids]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset the BDM picker when the working entity changes — the previous
  // selection is for a different entity and won't appear in the new BDM list.
  // BDMs default back to self; privileged users to empty (must pick again).
  useEffect(() => {
    setSelectedBdmId(isBdm ? (user?._id || '') : '');
  }, [workingEntityId, isBdm, user?._id]);

  // Phase G4.5f — clear the cycle-level instruction tag whenever the proxy
  // target changes. Avoids carrying the tag from one BDM's submit into another
  // BDM's session by accident.
  useEffect(() => { setBdmPhoneInstruction(''); }, [selectedBdmId, period, cycle]);

  useEffect(() => {
    if (settings) {
      setPerdiemRate(settings.PERDIEM_RATE_DEFAULT || 800);
      // Set global fallback thresholds; per-person overrides load when SMER is opened
      if (!perdiemThresholds.source) {
        setPerdiemThresholds(prev => ({ ...prev, full: settings.PERDIEM_MD_FULL ?? 8, half: settings.PERDIEM_MD_HALF ?? 3 }));
      }
    }
  }, [settings, perdiemThresholds.source]);

  // Generate empty daily entries for the period
  const generateDays = () => {
    const [year, month] = period.split('-').map(Number);
    const startDay = cycle === 'C1' ? 1 : 16;
    const endDay = cycle === 'C1' ? 15 : new Date(year, month, 0).getDate();
    const entries = [];

    for (let day = startDay; day <= endDay; day++) {
      const date = new Date(year, month - 1, day);
      const dow = date.getDay();
      if (dow === 0 || dow === 6) continue; // Skip weekends
      entries.push({
        day,
        entry_date: formatLocalDate(year, month, day),
        day_of_week: DAYS_OF_WEEK[dow - 1],
        activity_type: '',
        hospital_covered: '',
        hospital_ids: [],
        md_count: 0,
        perdiem_tier: 'ZERO',
        perdiem_amount: 0,
        transpo_p2p: 0,
        transpo_special: 0,
        ore_amount: 0,
        notes: ''
      });
    }
    return entries;
  };

  const computePerdiem = (count, activityType) => {
    // Phase G4.5ee — activity rule overrides MD-threshold logic when set.
    // Mirrors backend computePerdiemTier(..., { activityRule }) semantics so
    // the on-screen preview matches what postSmer will compute.
    const rule = activityType ? activityRuleByCode[String(activityType).toUpperCase()] : null;
    if (rule === 'AUTO_FULL') return { tier: 'FULL', amount: perdiemRate };
    if (rule === 'AUTO_HALF') return { tier: 'HALF', amount: Math.round(perdiemRate * 0.5 * 100) / 100 };
    if (rule === 'ZERO') return { tier: 'ZERO', amount: 0 };
    // USE_THRESHOLDS or unset → existing logic (CompProfile → PERDIEM_RATES → Settings)
    const fullThreshold = perdiemThresholds.full;
    const halfThreshold = perdiemThresholds.half;
    if (count >= fullThreshold) return { tier: 'FULL', amount: perdiemRate };
    if (count >= halfThreshold) return { tier: 'HALF', amount: Math.round(perdiemRate * 0.5 * 100) / 100 };
    return { tier: 'ZERO', amount: 0 };
  };

  const handleNewSmer = async () => {
    setEditingSmer(null);
    setDailyEntries(generateDays());
    setTravelAdvanceOverride(false);
    // Fetch revolving fund + per diem config in parallel
    try {
      const [rfRes, pdRes] = await Promise.all([
        getRevolvingFundAmount(),
        getPerdiemConfig()
      ]);
      const { amount, source } = rfRes?.data || {};
      setTravelAdvance(amount || 0);
      setTravelAdvanceSource(source || 'SETTINGS');
      const pd = pdRes?.data || {};
      setPerdiemThresholds({ full: pd.fullThreshold ?? 8, half: pd.halfThreshold ?? 3, source: pd.source || '', eligibility_source: pd.eligibility_source || 'visit', skip_flagged: !!pd.skip_flagged });
    } catch {
      setTravelAdvance(0);
      setTravelAdvanceSource('');
    }
    setShowForm(true);
  };

  const handleEditSmer = async (smer) => {
    try {
      const [res, pdRes] = await Promise.all([
        getSmerById(smer._id),
        getPerdiemConfig()
      ]);
      const data = res?.data;
      setEditingSmer(data);
      setDailyEntries(data.daily_entries || []);
      setTravelAdvance(data.travel_advance || 0);
      setTravelAdvanceSource('');
      setTravelAdvanceOverride(false);
      setPerdiemRate(data.perdiem_rate || 800);
      const pd = pdRes?.data || {};
      setPerdiemThresholds({ full: pd.fullThreshold ?? 8, half: pd.halfThreshold ?? 3, source: pd.source || '', eligibility_source: pd.eligibility_source || 'visit', skip_flagged: !!pd.skip_flagged });
      setShowForm(true);
    } catch (err) { console.error('[SMER]', err.message); showError(err, 'Could not load SMER'); }
  };

  const handleEntryChange = (index, field, value) => {
    setDailyEntries(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };

      // When "No Work" is selected, force zero everything
      if (field === 'activity_type' && value === 'NO_WORK') {
        updated[index].md_count = 0;
        updated[index].perdiem_tier = 'ZERO';
        updated[index].perdiem_amount = 0;
        updated[index].perdiem_override = false;
        updated[index].override_tier = undefined;
        updated[index].override_reason = undefined;
        updated[index].hospital_ids = [];
        updated[index].hospital_id = undefined;
        updated[index].hospital_covered = '';
      }

      // Auto-compute per diem when engagement count OR activity type changes — but NOT if overridden or No Work
      // Phase G4.5ee — pass activity_type so the AUTO_FULL/AUTO_HALF/ZERO rule
      // applies when set (e.g. OFFICE day shows FULL ₱650 the moment the user
      // picks "Office", without needing to enter MDs).
      if ((field === 'md_count' || (field === 'activity_type' && value && value !== 'NO_WORK')) && !updated[index].perdiem_override && updated[index].activity_type !== 'NO_WORK') {
        const { tier, amount } = computePerdiem(updated[index].md_count || 0, updated[index].activity_type);
        updated[index].perdiem_tier = tier;
        updated[index].perdiem_amount = amount;
      }
      return updated;
    });
  };

  const [saveError, setSaveError] = useState(null);
  const savingRef = useRef(false);

  const handleSave = async () => {
    if (savingRef.current || loading) return; // prevent double-submit on slow mobile
    if (!canWrite) { showError(null, 'Read-only: pick your own BDM or get expenses.smer_proxy ticked to file on behalf.'); return; }
    // Frontend validation
    const issues = [];
    dailyEntries.forEach(e => {
      if (e.activity_type === 'NO_WORK' && e.md_count > 0) issues.push(`${e.day_of_week} ${e.entry_date?.split('T')[0] || ''}: "No Work" day cannot have engagements`);
      if (e.md_count > 0 && !e.activity_type) issues.push(`${e.day_of_week} ${e.entry_date?.split('T')[0] || ''}: Activity type required when MDs > 0`);
    });
    if (issues.length) { showError(null, issues.join('. ')); return; }
    // Phase G4.5f — on proxy create, the cycle-level instruction tag is required.
    // (The same tag is also required at submit time; collecting it here saves a
    // round-trip and surfaces the warning earlier in the workflow.)
    const tag = String(bdmPhoneInstruction || '').trim();
    if (canWriteOnBehalf && !editingSmer && !tag) {
      setSaveError('Note about this submit (short tag like "ok with boss") is required when filing SMER on behalf of another BDM.');
      return;
    }

    const data = {
      period, cycle,
      perdiem_rate: perdiemRate,
      travel_advance: travelAdvance,
      daily_entries: dailyEntries
    };
    // Phase G4.5f — on create, send body.assigned_to when filing on behalf
    // (proxy eligible + viewing another BDM). The backend's resolveOwnerForWrite
    // stamps bdm_id = target + recorded_on_behalf_of = caller. On update,
    // ownership is locked — assigned_to is stripped server-side.
    if (canWriteOnBehalf && !editingSmer) {
      data.assigned_to = selectedBdmId;
      data.bdm_phone_instruction = tag;
    }
    setSaveError(null);
    savingRef.current = true;
    try {
      if (editingSmer) { await updateSmer(editingSmer._id, data); }
      else { await createSmer(data); }
      setShowForm(false);
      loadSmers();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Save failed';
      setSaveError(msg.includes('already exists')
        ? `SMER for ${period} ${cycle} already exists. Use Edit on the existing entry instead of creating a new one.`
        : msg);
    } finally { savingRef.current = false; }
  };

  // CRM pull — render whenever a target BDM is picked. Covers (a) field BDMs
  // self-filing (selectedBdmId defaults to own _id), (b) admin/president/finance
  // viewing a BDM (Phase G4.5f scope), and (c) eBDM proxies filing for another
  // BDM. The backend resolver enforces proxy-perm + privilege rules, so the
  // render gate just needs to know "is there a target?". Previously gated on
  // `user.role === CONTRACTOR`, which hid the button from the privileged users
  // who needed it most after the Phase G4.5f bdm_id wiring.
  const canPullFromCrm = !!selectedBdmId;
  const handlePullFromCrm = async () => {
    try {
      // Phase G4.5f follow-up — forward selectedBdmId so privileged + proxy
      // callers pull the target BDM's CRM visits, not their own (admins have
      // no Visit rows; eBDM proxies would otherwise pull their own per-diem
      // counts into someone else's SMER). Self-filers omit; backend self-scopes.
      const res = await getSmerCrmMdCounts(period, cycle, selectedBdmId || undefined);
      const crmEntries = res?.data?.daily_entries || [];
      if (!crmEntries.length) return;
      const crmMap = Object.fromEntries(crmEntries.map(e => [e.entry_date, e]));

      setDailyEntries(prev => {
        return prev.map(entry => {
          // Skip "No Work" entries — CRM data should not overwrite them
          if (entry.activity_type === 'NO_WORK') return entry;
          // Normalize: DB dates may be full ISO ("2026-04-01T00:00:00.000Z"), CRM keys are "2026-04-01"
          const entryDateKey = (entry.entry_date || '').split('T')[0];
          const crm = crmMap[entryDateKey];
          if (!crm) return entry;
          // Stash flagged_excluded as a transient UI hint so the per-day row can
          // surface "X flagged not counted" — not persisted on save (server is
          // the source of truth for flag-driven exclusions on every re-pull).
          const updated = { ...entry, md_count: crm.md_count, _flaggedExcluded: crm.flagged_excluded || 0 };
          if (!entry.perdiem_override) {
            updated.perdiem_tier = crm.perdiem_tier;
            updated.perdiem_amount = crm.perdiem_amount;
          }
          // Auto-fill location details from CRM visit data
          if (crm.locations && !entry.notes) {
            updated.notes = crm.locations;
          }
          return updated;
        });
      });
    } catch (err) {
      console.error('[SMER] CRM pull failed:', err.response?.data || err.message);
      showError(err, 'Pull from CRM failed');
    }
  };

  // Phase G4.5f — build the proxy/scope body for cycle-level mutating endpoints
  // (validate / submit / reopen). Privileged + proxy callers must always send
  // bdm_id under the new G4.5f scoping; self-filers may omit it (backend
  // self-scopes via tenantFilter).
  const buildScopeBody = (extra) => {
    const body = { period, cycle, ...(extra || {}) };
    if (selectedBdmId) body.bdm_id = selectedBdmId;
    return body;
  };
  const handleValidate = async () => {
    if (!canWrite) { showError(null, 'Read-only: pick your own BDM or get expenses.smer_proxy ticked to file on behalf.'); return; }
    try { await validateSmer(buildScopeBody()); loadSmers(); } catch (err) { showError(err, 'Could not validate SMER'); }
  };
  const handleSubmit = async () => {
    if (!canWrite) { showError(null, 'Read-only: pick your own BDM or get expenses.smer_proxy ticked to file on behalf.'); return; }
    // Phase G4.5f — proxy submit requires the cycle-level bdm_phone_instruction
    // tag. Required and non-empty after trim.
    const tag = String(bdmPhoneInstruction || '').trim();
    if (canWriteOnBehalf && !tag) {
      showError(null, 'Note about this submit (short tag like "ok with boss") is required when posting SMER on behalf of another BDM.');
      return;
    }
    const body = buildScopeBody();
    if (canWriteOnBehalf) body.bdm_phone_instruction = tag;
    try {
      const res = await submitSmer(body);
      if (res?.approval_pending) { showApprovalPending(res.message); }
      loadSmers();
    } catch (err) {
      if (err?.response?.data?.approval_pending) { showApprovalPending(err.response.data.message); loadSmers(); }
      else showError(err, 'Could not submit SMER');
    }
  };
  const handleReopen = async (id) => {
    if (!canWrite) { showError(null, 'Read-only: pick your own BDM or get expenses.smer_proxy ticked to file on behalf.'); return; }
    try { await reopenSmer([id], selectedBdmId ? { bdm_id: selectedBdmId } : undefined); loadSmers(); }
    catch (err) { showError(err, 'Could not reopen SMER'); }
  };
  const handleDelete = async (id) => {
    if (!canWrite) { showError(null, 'Read-only: pick your own BDM or get expenses.smer_proxy ticked to file on behalf.'); return; }
    try { await deleteDraftSmer(id); loadSmers(); } catch (err) { showError(err, 'Could not delete SMER'); }
  };
  // Revert VALID → DRAFT so the BDM can edit. Confirms once because reverting
  // clears the validation snapshot and forces a re-validate before submit.
  const handleRevert = async (id) => {
    if (!canWrite) { showError(null, 'Read-only: pick your own BDM or get expenses.smer_proxy ticked to file on behalf.'); return; }
    if (!window.confirm('Revert this SMER to DRAFT? You will need to re-validate before submitting.')) return;
    try { await revertSmer(id); loadSmers(); } catch (err) { showError(err, 'Could not revert SMER'); }
  };

  const isManagement = ROLE_SETS.MANAGEMENT.includes(user?.role);

  // Override Request Modal state
  const [overrideModal, setOverrideModal] = useState(null); // { index, entry }
  // Phase G4.5f — overrideForm now also captures bdm_phone_instruction for the
  // proxy path. Required and non-empty after trim when canWriteOnBehalf is true.
  const [overrideForm, setOverrideForm] = useState({ tier: 'FULL', reason: '', bdm_phone_instruction: '' });
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);

  const handleOverride = (index) => {
    const entry = dailyEntries[index];
    if (!editingSmer?._id) {
      showError(null, 'Save the SMER first before requesting an override.');
      return;
    }
    setOverrideForm({ tier: 'FULL', reason: '', bdm_phone_instruction: '' });
    setOverrideModal({ index, entry });
  };

  const handleOverrideSubmit = async () => {
    if (!overrideModal) return;
    const { index, entry } = overrideModal;
    const { tier, reason } = overrideForm;
    if (!reason.trim()) { showError(null, 'Please enter a reason for the override.'); return; }

    // Phase G4.5f — proxy path requires the per-day authorization tag.
    const tag = String(overrideForm.bdm_phone_instruction || '').trim();
    if (canWriteOnBehalf && !tag) {
      showError(null, 'Note about this submit (short tag like "ok with boss") is required when requesting an override on behalf of another BDM.');
      return;
    }

    setOverrideSubmitting(true);
    try {
      const payload = {
        entry_id: entry._id,
        override_tier: tier,
        override_reason: reason.trim(),
      };
      if (canWriteOnBehalf) payload.bdm_phone_instruction = tag;
      const res = await overridePerdiemDay(editingSmer._id, payload);
      if (res?.approval_pending) {
        // Approval required — update local entry with pending state
        const smerData = res?.data;
        if (smerData?.daily_entries) {
          setDailyEntries(smerData.daily_entries);
        } else {
          setDailyEntries(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], override_status: 'PENDING', requested_override_tier: tier, override_reason: reason.trim() };
            return updated;
          });
        }
        setOverrideModal(null);
      } else {
        // No approval rules — override applied directly
        const smerData = res?.data;
        if (smerData?.daily_entries) {
          setDailyEntries(smerData.daily_entries);
        } else {
          const { amount } = computePerdiem(tier === 'FULL' ? 999 : 3);
          setDailyEntries(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], perdiem_override: true, override_tier: tier, override_reason: reason, perdiem_tier: tier, perdiem_amount: amount };
            return updated;
          });
        }
        setOverrideModal(null);
      }
    } catch (err) {
      if (err?.response?.status === 202 || err?.response?.data?.approval_pending) {
        const smerData = err?.response?.data?.data;
        if (smerData?.daily_entries) {
          setDailyEntries(smerData.daily_entries);
        } else {
          setDailyEntries(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], override_status: 'PENDING', requested_override_tier: tier, override_reason: reason.trim() };
            return updated;
          });
        }
        setOverrideModal(null);
      } else {
        showError(err, 'Could not request override');
      }
    } finally {
      setOverrideSubmitting(false);
    }
  };

  const handleRemoveOverride = async (index) => {
    const entry = dailyEntries[index];
    if (editingSmer?._id && entry._id) {
      try {
        const res = await overridePerdiemDay(editingSmer._id, {
          entry_id: entry._id,
          remove_override: true,
        });
        if (res?.data?.daily_entries) {
          setDailyEntries(res.data.daily_entries);
          return;
        }
      } catch (err) {
        showError(err, 'Could not remove override');
        return;
      }
    }
    // Fallback: local state update for unsaved SMERs
    setDailyEntries(prev => {
      const updated = [...prev];
      const e = updated[index];
      // Phase G4.5ee — pass activity_type so a reverted OFFICE day correctly
      // returns to FULL (or whatever the activity rule says) rather than the
      // MD-threshold result the override was masking.
      const { tier, amount } = computePerdiem(e.md_count || 0, e.activity_type);
      updated[index] = { ...e, perdiem_override: false, override_tier: undefined, override_reason: undefined, perdiem_tier: tier, perdiem_amount: amount };
      return updated;
    });
  };

  // Hospital multi-picker helpers
  const handleAddHospital = (entryIdx, hospital) => {
    setDailyEntries(prev => {
      const updated = [...prev];
      const entry = { ...updated[entryIdx] };
      const ids = [...(entry.hospital_ids || [])];
      if (!ids.includes(hospital._id)) ids.push(hospital._id);
      entry.hospital_ids = ids;
      // Auto-fill hospital_covered as comma-joined names
      entry.hospital_covered = ids.map(id => {
        const h = hospitals.find(h => h._id === id);
        return h?.hospital_name || id;
      }).join(', ');
      updated[entryIdx] = entry;
      return updated;
    });
    setActiveHospitalPicker(null);
    setHospitalSearch('');
  };

  const handleRemoveHospital = (entryIdx, hospitalId) => {
    setDailyEntries(prev => {
      const updated = [...prev];
      const entry = { ...updated[entryIdx] };
      const ids = (entry.hospital_ids || []).filter(id => id !== hospitalId);
      entry.hospital_ids = ids;
      entry.hospital_covered = ids.map(id => {
        const h = hospitals.find(h => h._id === id);
        return h?.hospital_name || id;
      }).join(', ');
      updated[entryIdx] = entry;
      return updated;
    });
  };

  const filteredHospitals = (entryIdx) => {
    const entry = dailyEntries[entryIdx];
    const selectedIds = entry?.hospital_ids || [];
    const q = hospitalSearch.toLowerCase();
    return hospitals
      .filter(h => !selectedIds.includes(h._id))
      .filter(h => !q || h.hospital_name?.toLowerCase().includes(q))
      .slice(0, 15);
  };

  // Hospital chip renderer
   
  const HospitalChips = ({ entryIdx }) => {
    const entry = dailyEntries[entryIdx];
    const ids = entry?.hospital_ids || [];
    if (!ids.length && entry?.activity_type !== 'Field') return null;
    return (
      <div className="hospital-chips">
        {ids.map(id => {
          const h = hospitals.find(h => h._id === id);
          return (
            <span key={id} className="hospital-chip">
              {h?.hospital_name || id}
              <button onClick={() => handleRemoveHospital(entryIdx, id)}>&times;</button>
            </span>
          );
        })}
        {entry?.activity_type === 'Field' && (
          <span style={{ position: 'relative', display: 'inline-block' }} ref={activeHospitalPicker === entryIdx ? hospitalPickerRef : undefined}>
            <button
              onClick={() => { setActiveHospitalPicker(activeHospitalPicker === entryIdx ? null : entryIdx); setHospitalSearch(''); }}
              style={{ padding: '1px 6px', borderRadius: 10, border: '1px dashed #93c5fd', background: '#f8fafc', color: '#3b82f6', fontSize: 11, cursor: 'pointer' }}
            >+ Hospital</button>
            {activeHospitalPicker === entryIdx && (
              <div className="hospital-picker-dropdown">
                <input
                  autoFocus
                  placeholder="Search hospital..."
                  value={hospitalSearch}
                  onChange={e => setHospitalSearch(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: 'none', borderBottom: '1px solid #e5e7eb', fontSize: 13, outline: 'none' }}
                />
                {filteredHospitals(entryIdx).map(h => (
                  <div key={h._id} className="hospital-picker-item" onClick={() => handleAddHospital(entryIdx, h)}>
                    {h.hospital_name}
                  </div>
                ))}
                {filteredHospitals(entryIdx).length === 0 && (
                  <div style={{ padding: '8px 12px', color: '#94a3b8', fontSize: 12 }}>No hospitals found</div>
                )}
              </div>
            )}
          </span>
        )}
      </div>
    );
  };
   

  // Compute totals — ORE retired 2026-04; flows via Expenses module only.
  const totals = dailyEntries.reduce((acc, e) => ({
    perdiem: acc.perdiem + (e.perdiem_amount || 0),
    transpo: acc.transpo + (e.transpo_p2p || 0),
    special: acc.special + (e.transpo_special || 0)
  }), { perdiem: 0, transpo: 0, special: 0 });
  const totalReimbursable = totals.perdiem + totals.transpo + totals.special;
  const balanceOnHand = travelAdvance - totalReimbursable;

  // Split SMERs into Working (actionable) vs Posted (archive)
  const workingSmers = smers.filter(s => s.status !== 'POSTED');
  const postedSmers = smers.filter(s => s.status === 'POSTED');
  const visibleSmers = listTab === 'working' ? workingSmers : postedSmers;

  return (
    <div className="admin-page erp-page">
      <style>{smerMobileStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main" style={{ padding: 24 }}>
          <WorkflowGuide pageKey="smer" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <h1 style={{ margin: 0, color: 'var(--erp-text, #132238)' }}>SMER — Per Diem</h1>
            <Link to="/erp/expenses" style={{ color: 'var(--erp-accent, #1e5eff)', fontSize: 14 }}>&larr; Back to Expenses</Link>
          </div>

          {/* Period/Cycle selector */}
          <div className="smer-controls" style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)' }} />
            <SelectField value={cycle} onChange={e => setCycle(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)' }}>
              <option value="C1">Cycle 1 (1st-15th)</option>
              <option value="C2">Cycle 2 (16th-end)</option>
              <option value="MONTHLY">Monthly</option>
            </SelectField>
            {/* Phase G4.5f — BDM picker shows for admin/finance/president (view audit)
                AND for proxy-eligible eBDMs with expenses.smer_proxy ticked.
                Plain BDMs without proxy still self-scope via tenantFilter. */}
            {(isPrivileged || canProxySmer) && (
              <select
                value={selectedBdmId}
                onChange={e => setSelectedBdmId(e.target.value)}
                title={canProxySmer ? 'Choose whose SMER to file on behalf of — required' : 'Choose which BDM\'s SMER to view — required for privileged roles'}
                style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${canWriteOnBehalf ? '#a78bfa' : 'var(--erp-border, #dbe4f0)'}`, minWidth: 180 }}
              >
                <option value="">{canProxySmer ? 'Select a BDM to file on behalf…' : 'Select a BDM…'}</option>
                {bdmOptions.map(b => (
                  <option key={b._id} value={b._id}>{b.name}</option>
                ))}
              </select>
            )}
            <button onClick={handleNewSmer} disabled={!canWrite} title={!canWrite ? 'Read-only: pick your own BDM or get expenses.smer_proxy ticked' : undefined} style={{ padding: '6px 16px', borderRadius: 6, background: 'var(--erp-accent, #1e5eff)', color: '#fff', border: 'none', cursor: canWrite ? 'pointer' : 'default', opacity: canWrite ? 1 : 0.5 }}>+ New SMER</button>
            <button onClick={handleValidate} disabled={loading || !canWrite} title={!canWrite ? 'Read-only: pick your own BDM or get expenses.smer_proxy ticked' : undefined} style={{ padding: '6px 16px', borderRadius: 6, background: '#22c55e', color: '#fff', border: 'none', cursor: (loading || !canWrite) ? 'default' : 'pointer', opacity: canWrite ? 1 : 0.5 }}>Validate</button>
            <button onClick={handleSubmit} disabled={loading || !canWrite} title={!canWrite ? 'Read-only: pick your own BDM or get expenses.smer_proxy ticked' : undefined} style={{ padding: '6px 16px', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: (loading || !canWrite) ? 'default' : 'pointer', opacity: canWrite ? 1 : 0.5 }}>Submit</button>
          </div>

          {/* Phase G4.5f — banner varies by proxy eligibility.
              canWriteOnBehalf → proxy write mode; viewingOther without proxy → read-only audit. */}
          {viewingOther && canWriteOnBehalf && (
            <div style={{ padding: 10, marginBottom: 12, borderRadius: 8, background: '#f5f3ff', border: '1px solid #c4b5fd', fontSize: 13, color: '#6d28d9' }}>
              <strong>Proxy write mode</strong> — recording on behalf of <strong>{bdmOptions.find(b => b._id === selectedBdmId)?.name || 'BDM'}</strong>. Saves stamp <code>bdm_id</code> = target BDM and audit <code>recorded_on_behalf_of</code> = you. Submit force-routes through the Approval Hub (Rule #20 four-eyes). A short authorization tag is required at submit time.
            </div>
          )}
          {viewingOther && !canWriteOnBehalf && (
            <div style={{ padding: 10, marginBottom: 12, borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: 13, color: '#1e40af' }}>
              Viewing <strong>{bdmOptions.find(b => b._id === selectedBdmId)?.name || 'BDM'}</strong>&apos;s SMER — read-only. (Proxy write requires <code>expenses.smer_proxy</code> ticked on your Access Template.)
            </div>
          )}
          {isPrivileged && !selectedBdmId && (
            <div style={{ padding: 10, marginBottom: 12, borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 13, color: '#92400e' }}>
              Select a BDM above to view their SMER. SMER is a per-person per-cycle document; pick whose SMER to inspect.
            </div>
          )}

          {/* Phase G4.5f — cycle-level authorization tag (proxy write mode only).
              Single textbox kept above the list so the value is visible across
              New / Validate / Submit. Required on proxy submit (controller 400s
              if empty after trim). */}
          {viewingOther && canWriteOnBehalf && (
            <div style={{ padding: 10, marginBottom: 12, borderRadius: 8, background: '#fff', border: '1px solid #c4b5fd' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#6d28d9' }}>
                Note about this submit (required for proxy)
              </label>
              <input
                type="text"
                placeholder='e.g. "ok with boss", "in the office", "with client", "confirmed over phone"'
                value={bdmPhoneInstruction}
                onChange={e => setBdmPhoneInstruction(e.target.value)}
                maxLength={200}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 13, boxSizing: 'border-box' }}
              />
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--erp-muted, #5f7188)' }}>
                Short tag is fine. This is an authorization trail, not a narrative — it appears in the Approval Hub card and the BDM&apos;s receipt inbox.
              </div>
            </div>
          )}

          {/* Working vs Posted tabs — separates actionable SMERs from archive */}
          {!showForm && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <button
                onClick={() => setListTab('working')}
                style={{ padding: '7px 14px', minHeight: 40, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: listTab === 'working' ? 'var(--erp-accent, #2563eb)' : 'transparent', color: listTab === 'working' ? '#fff' : 'var(--erp-text)', borderWidth: 1, borderStyle: 'solid', borderColor: listTab === 'working' ? 'transparent' : 'var(--erp-border, #dbe4f0)' }}
              >
                Working {workingSmers.length > 0 ? `(${workingSmers.length})` : ''}
              </button>
              <button
                onClick={() => setListTab('posted')}
                title="Already-posted SMERs (archive)"
                style={{ padding: '7px 14px', minHeight: 40, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: listTab === 'posted' ? 'var(--erp-accent, #2563eb)' : 'transparent', color: listTab === 'posted' ? '#fff' : 'var(--erp-text)', borderWidth: 1, borderStyle: 'solid', borderColor: listTab === 'posted' ? 'transparent' : 'var(--erp-border, #dbe4f0)' }}
              >
                Posted {postedSmers.length > 0 ? `(${postedSmers.length})` : ''}
              </button>
            </div>
          )}

          {/* SMER List */}
          {!showForm && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: 'var(--erp-bg-alt, #f1f5f9)', borderBottom: '2px solid var(--erp-border, #dbe4f0)' }}>
                    <th style={{ padding: 8, textAlign: 'left' }}>BDM</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>Period</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>Cycle</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Days</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Per Diem</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Transport</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Total</th>
                    <th style={{ padding: 8, textAlign: 'center' }}>Status</th>
                    <th style={{ padding: 8, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSmers.map(s => (
                    <React.Fragment key={s._id}>
                    <tr style={{ borderBottom: s.status === 'ERROR' ? 'none' : '1px solid var(--erp-border, #dbe4f0)' }}>
                      <td style={{ padding: 8 }}>
                        {s.bdm_id?.name || '—'}
                        {/* Phase G4.5f — Proxied pill (row-level). Visible whenever
                            the SMER cycle was created or submitted on behalf. */}
                        {s.recorded_on_behalf_of && (
                          <span title={`Recorded on behalf by ${s.recorded_on_behalf_of?.name || 'a proxy'}${s.bdm_phone_instruction ? ` — "${s.bdm_phone_instruction}"` : ''}`} style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 8, background: '#f5f3ff', border: '1px solid #c4b5fd', fontSize: 10, color: '#6d28d9', fontWeight: 600 }}>Proxied</span>
                        )}
                      </td>
                      <td style={{ padding: 8 }}>{s.period}</td>
                      <td style={{ padding: 8 }}>{s.cycle}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{s.working_days}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>₱{(s.total_perdiem || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>₱{(s.total_transpo || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>₱{(s.total_reimbursable || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: 'center' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, color: '#fff', background: STATUS_COLORS[s.status] || '#6b7280' }}>{s.status}</span>
                      </td>
                      <td style={{ padding: 8, textAlign: 'center' }}>
                        {editableStatuses.includes(s.status) && (
                          <button onClick={() => handleEditSmer(s)} style={{ marginRight: 4, padding: '2px 8px', fontSize: 12, borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', cursor: 'pointer' }}>Edit</button>
                        )}
                        {s.status === 'VALID' && (
                          <button onClick={() => handleRevert(s._id)} title="Revert to DRAFT so you can edit. You will need to re-validate before submitting." style={{ marginRight: 4, padding: '2px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #eab308', background: '#fff', color: '#b45309', cursor: 'pointer' }}>↶ Revert</button>
                        )}
                        {s.status === 'DRAFT' && (
                          <button onClick={() => handleDelete(s._id)} style={{ padding: '2px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #ef4444', background: '#fff', color: '#ef4444', cursor: 'pointer' }}>Del</button>
                        )}
                        {s.status === 'POSTED' && (
                          <button onClick={() => handleReopen(s._id)} style={{ padding: '2px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #eab308', background: '#fff', color: '#b45309', cursor: 'pointer' }}>Re-open</button>
                        )}
                      </td>
                    </tr>
                    {s.status === 'ERROR' && s.rejection_reason && (
                      <tr style={{ borderBottom: '1px solid var(--erp-border, #dbe4f0)' }}>
                        <td colSpan={9} style={{ padding: '6px 8px 4px' }}>
                          <RejectionBanner
                            row={s}
                            moduleKey="SMER"
                            variant="page"
                            docLabel={`${s.period} ${s.cycle}`}
                            onResubmit={(row) => handleEditSmer(row)}
                          />
                        </td>
                      </tr>
                    )}
                    {s.status === 'ERROR' && s.validation_errors?.length > 0 && (
                      <tr style={{ borderBottom: '1px solid var(--erp-border, #dbe4f0)' }}>
                        <td colSpan={9} style={{ padding: '4px 8px 8px', background: '#fef2f2' }}>
                          <div style={{ fontSize: 12, color: '#dc2626' }}>
                            {s.validation_errors.map((err, i) => <div key={i}>- {err}</div>)}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                  {!visibleSmers.length && <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: 'var(--erp-muted, #5f7188)' }}>{listTab === 'working' ? 'No unposted SMERs for this period' : 'No posted SMERs for this period'}</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* SMER Form */}
          {showForm && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18, color: 'var(--erp-text, #132238)' }}>{editingSmer ? 'Edit SMER' : 'New SMER'} — {period} {cycle}</h2>
                <button onClick={() => setShowForm(false)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', cursor: 'pointer' }}>Cancel</button>
              </div>

              {/* Summary cards — ABOVE grid so they're always visible */}
              <div className="smer-summary-row" style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--erp-border, #dbe4f0)', minWidth: 130 }}>
                  <div style={{ fontSize: 11, color: 'var(--erp-muted, #5f7188)' }}>Total Reimbursable</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--erp-text, #132238)' }}>₱{totalReimbursable.toLocaleString()}</div>
                </div>
                <div style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--erp-border, #dbe4f0)', minWidth: 130 }}>
                  <div style={{ fontSize: 11, color: 'var(--erp-muted, #5f7188)' }}>Travel Advance</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>₱{travelAdvance.toLocaleString()}</div>
                </div>
                <div style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${balanceOnHand >= 0 ? '#22c55e' : '#ef4444'}`, minWidth: 130 }}>
                  <div style={{ fontSize: 11, color: 'var(--erp-muted, #5f7188)' }}>Balance on Hand</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: balanceOnHand >= 0 ? '#16a34a' : '#dc2626' }}>₱{balanceOnHand.toLocaleString()}</div>
                </div>
                <div style={{ padding: '8px 14px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', minWidth: 80 }}>
                  <div style={{ fontSize: 11, color: '#166534' }}>Per Diem</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#166534' }}>₱{totals.perdiem.toLocaleString()}</div>
                </div>
                <a href="/erp/expenses" style={{ padding: '8px 14px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe', minWidth: 80, textDecoration: 'none', display: 'block' }}>
                  <div style={{ fontSize: 11, color: '#1e40af' }}>Transport & ORE</div>
                  <div style={{ fontSize: 12, color: '#2563eb' }}>Enter in Expenses →</div>
                </a>
              </div>

              {/* Per Diem Rate + Travel Advance + CRM Pull */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ fontSize: 13 }}>Rate: <input type="number" value={perdiemRate} onChange={e => setPerdiemRate(Number(e.target.value))} style={{ width: 70, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)' }} /></label>
                <span style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  Advance:{' '}
                  {travelAdvanceOverride ? (
                    <input type="number" value={travelAdvance} onChange={e => setTravelAdvance(Number(e.target.value))} style={{ width: 90, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)' }} />
                  ) : (
                    <span style={{ fontWeight: 600 }}>{'\u20B1'}{travelAdvance.toLocaleString()}</span>
                  )}
                  <button type="button" onClick={() => { const next = !travelAdvanceOverride; setTravelAdvanceOverride(next); if (next) setTravelAdvanceSource('MANUAL'); }} style={{ padding: '2px 8px', fontSize: 11, borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', background: travelAdvanceOverride ? '#fef3c7' : 'transparent', cursor: 'pointer', color: 'var(--erp-muted)' }}>
                    {travelAdvanceOverride ? 'Lock' : 'Override'}
                  </button>
                  {travelAdvanceSource && !travelAdvanceOverride && <span style={{ fontSize: 10, color: '#6b7280', marginLeft: 2 }}>{travelAdvanceSource === 'COMP_PROFILE' ? 'CompProfile' : 'Default'}</span>}
                </span>
                {canPullFromCrm && (() => {
                  // Phase G1.5 follow-up — label tracks the resolved data source
                  // so non-pharma subscribers (logbook source) and manual-entry
                  // subscribers don't see a misleading "Pull from CRM" button.
                  const src = perdiemThresholds.eligibility_source;
                  const pullDisabled = loading || src === 'manual' || src === 'none';
                  const label = src === 'logbook' ? 'Pull from Logbook' : src === 'manual' || src === 'none' ? 'Pull disabled' : 'Pull from CRM';
                  return (
                    <button onClick={handlePullFromCrm} disabled={pullDisabled} title={pullDisabled && (src === 'manual' || src === 'none') ? 'Eligibility source is manual; enter MDs by hand.' : ''} style={{ padding: '4px 14px', borderRadius: 6, background: pullDisabled ? '#9ca3af' : '#16a34a', color: '#fff', border: 'none', cursor: pullDisabled ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>{label}</button>
                  );
                })()}
                <span style={{ fontSize: 11, color: 'var(--erp-muted, #5f7188)' }}>
                  Full ≥ {perdiemThresholds.full} | Half ≥ {perdiemThresholds.half}
                  {perdiemThresholds.source === 'COMP_PROFILE' && <span style={{ marginLeft: 4, color: '#2563eb', fontWeight: 600 }}>(per-person)</span>}
                </span>
              </div>
              {canPullFromCrm && (() => {
                // Banner copy mirrors button label so a logbook-sourced subscriber
                // doesn't read "from your logged visits" when the data actually
                // comes from CarLogbookEntry. Engagement-types intentionally
                // dropped — SMER day schema has no engagement field today, so
                // the bridge cannot carry them; mentioning them was Rule #20
                // overpromise.
                const src = perdiemThresholds.eligibility_source;
                const sourceLabel = src === 'logbook' ? 'POSTED Car Logbook entries' : src === 'manual' || src === 'none' ? 'manual entry only — Pull is disabled for this entity' : 'your logged CRM visits';
                return (
                  <div style={{ padding: '6px 12px', marginBottom: 12, borderRadius: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 12, color: '#166534' }}>
                    BDMs: pull auto-fills MD counts and area visited from {sourceLabel}. You can still edit manually after pulling.
                    {perdiemThresholds.skip_flagged && src === 'visit' && <span style={{ marginLeft: 6, color: '#9a3412' }}>Visits with photo flags do not count toward per-diem.</span>}
                  </div>
                );
              })()}

              {/* Phase G4.5ee — activity-aware per-diem rule banner. Only renders
                  when at least one activity is mapped to a non-USE_THRESHOLDS
                  rule for this entity, so subscribers who run pharma-default
                  semantics see no extra noise. Mirrors the source-of-truth
                  ACTIVITY_PERDIEM_RULES lookup (admin-editable in Control
                  Center → Lookup Tables). Closes the "office staff write
                  MD=10 to claim FULL per-diem" data-pollution gap by making
                  the rule explicit on every preview. */}
              {(() => {
                const ruleEntries = Object.entries(activityRuleByCode || {});
                const interesting = ruleEntries.filter(([, r]) => r && r !== 'USE_THRESHOLDS');
                if (interesting.length === 0) return null;
                const fmt = (rule) => rule === 'AUTO_FULL' ? 'auto-FULL' : rule === 'AUTO_HALF' ? 'auto-HALF' : rule === 'ZERO' ? 'zero' : rule;
                return (
                  <div style={{ padding: '6px 12px', marginBottom: 12, borderRadius: 6, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: 12, color: '#1e40af' }}>
                    Activity-driven per-diem: {interesting.map(([code, rule], i) => (
                      <span key={code}>{i > 0 && ', '}<strong>{code}</strong> &rarr; {fmt(rule)}</span>
                    ))}. MD count is ignored for these activities; admin can flip via Control Center &rarr; Lookup Tables &rarr; ACTIVITY_PERDIEM_RULES.
                  </div>
                );
              })()}

              {/* Daily Entries Grid — Desktop */}
              <div className="smer-desktop-grid" style={{ overflowX: 'auto', marginBottom: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--erp-bg-alt, #f1f5f9)', borderBottom: '2px solid var(--erp-border, #dbe4f0)' }}>
                      <th style={{ padding: 6, textAlign: 'center', width: 65 }}>Date</th>
                      <th style={{ padding: 6, textAlign: 'center', width: 36 }}>DOW</th>
                      <th style={{ padding: 6, textAlign: 'center', width: 80 }}>Activity</th>
                      <th style={{ padding: 6, textAlign: 'left', width: 140 }}>Notes</th>
                      <th style={{ padding: 6, textAlign: 'center', width: 55 }}>MDs/<br/>Eng.</th>
                      <th style={{ padding: 6, textAlign: 'center', width: 50 }}>Tier</th>
                      <th style={{ padding: 6, textAlign: 'right', width: 70 }}>Per Diem</th>
                      <th style={{ padding: 6, textAlign: 'center', width: 65 }}>Ovrd</th>
                      {/* P2P, Special, ORE — hidden (entered via Expenses ORE) */}
                    </tr>
                  </thead>
                  <tbody>
                    {dailyEntries.map((entry, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--erp-border, #dbe4f0)', background: entry.perdiem_override ? '#faf5ff' : entry.override_status === 'PENDING' ? '#fffbeb' : entry.override_status === 'REJECTED' ? '#fef2f2' : undefined }}>
                        <td style={{ padding: 3, textAlign: 'center', fontSize: 11 }}>
                          {displayDate(entry.entry_date).slice(0, 5)}
                          {/* Phase G4.5f — per-day proxy badge (purple dot beside date).
                              Marks days where a per-diem override was requested by a proxy. */}
                          {entry.recorded_on_behalf_of && (
                            <span title={`Override requested by proxy${entry.bdm_phone_instruction ? ` — "${entry.bdm_phone_instruction}"` : ''}`} style={{ marginLeft: 3, color: '#7c3aed', fontSize: 9 }}>●</span>
                          )}
                        </td>
                        <td style={{ padding: 3, textAlign: 'center', fontSize: 10, color: 'var(--erp-muted, #5f7188)' }}>{entry.day_of_week}</td>
                        <td style={{ padding: 3 }}>
                          <SelectField value={entry.activity_type || entry.hospital_covered || ''} onChange={e => handleEntryChange(idx, 'activity_type', e.target.value)} style={{ width: '100%', padding: '2px 4px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 11 }}>
                            <option value="">—</option>
                            {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </SelectField>
                        </td>
                        <td style={{ padding: 3 }}>
                          <input placeholder="Details..." value={entry.notes || ''} onChange={e => handleEntryChange(idx, 'notes', e.target.value)} style={{ width: '100%', padding: '2px 4px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 11 }} />
                          <HospitalChips entryIdx={idx} />
                        </td>
                        <td style={{ padding: 3, textAlign: 'center' }}>
                          <input type="number" min={0} value={entry.md_count} onChange={e => handleEntryChange(idx, 'md_count', Number(e.target.value))} disabled={entry.activity_type === 'NO_WORK'} style={{ width: 45, padding: '2px 3px', textAlign: 'center', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12, opacity: entry.activity_type === 'NO_WORK' ? 0.4 : 1 }} />
                          {entry._flaggedExcluded > 0 && (
                            <div title="Visits with photo flags were excluded from the per-diem count. Open MyVisits to clear the flag." style={{ fontSize: 9, fontWeight: 600, color: '#9a3412', marginTop: 1, cursor: 'help' }}>
                              {entry._flaggedExcluded} flagged
                            </div>
                          )}
                        </td>
                        <td style={{ padding: 3, textAlign: 'center' }}>
                          <span style={{ padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 600, color: entry.perdiem_tier === 'FULL' ? '#16a34a' : entry.perdiem_tier === 'HALF' ? '#d97706' : '#9ca3af', background: entry.perdiem_tier === 'FULL' ? '#dcfce7' : entry.perdiem_tier === 'HALF' ? '#fef3c7' : '#f3f4f6' }}>
                            {entry.activity_type === 'NO_WORK' ? '—' : entry.perdiem_tier}
                          </span>
                          {entry.perdiem_override && <span title={entry.override_reason} style={{ marginLeft: 1, cursor: 'help', fontSize: 9, color: '#7c3aed' }}>★</span>}
                          {entry.override_status === 'PENDING' && <div style={{ fontSize: 8, fontWeight: 600, color: '#92400e' }}>REQ: {entry.requested_override_tier}</div>}
                          {entry.override_status === 'REJECTED' && <div style={{ fontSize: 8, fontWeight: 600, color: '#991b1b' }}>REJECTED</div>}
                        </td>
                        <td style={{ padding: 3, textAlign: 'right', fontWeight: 500, fontSize: 12 }}>₱{(entry.perdiem_amount || 0).toLocaleString()}</td>
                        <td style={{ padding: 3, textAlign: 'center' }}>
                          {entry.activity_type === 'NO_WORK' ? (
                            <span style={{ fontSize: 9, color: '#9ca3af' }}>—</span>
                          ) : entry.perdiem_override ? (
                            isManagement ? (
                              <button onClick={() => handleRemoveOverride(idx)} title={entry.override_reason} style={{ padding: '1px 5px', fontSize: 9, borderRadius: 4, border: '1px solid #7c3aed', color: '#7c3aed', background: '#f5f3ff', cursor: 'pointer' }}>Undo</button>
                            ) : (
                              <span title={entry.override_reason} style={{ fontSize: 9, color: '#7c3aed' }}>&#9733;</span>
                            )
                          ) : entry.override_status === 'PENDING' ? (
                            <span title={`Requested: ${entry.requested_override_tier}`} style={{ padding: '1px 4px', fontSize: 8, borderRadius: 4, fontWeight: 600, color: '#92400e', background: '#fef3c7' }}>Pending</span>
                          ) : entry.override_status === 'REJECTED' ? (
                            <button onClick={() => handleOverride(idx)} title="Previous request was rejected — retry" style={{ padding: '1px 5px', fontSize: 9, borderRadius: 4, border: '1px solid #ef4444', color: '#ef4444', background: '#fef2f2', cursor: 'pointer' }}>Retry</button>
                          ) : (
                            <button onClick={() => handleOverride(idx)} style={{ padding: '1px 5px', fontSize: 9, borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', color: 'var(--erp-muted)', background: '#fff', cursor: 'pointer' }}>+</button>
                          )}
                        </td>
                        {/* P2P, Special, ORE inputs hidden — enter via Expenses ORE */}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--erp-bg-alt, #f1f5f9)', fontWeight: 600, fontSize: 12 }}>
                      <td colSpan={7} style={{ padding: 6, textAlign: 'right' }}>Totals:</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>₱{totals.perdiem.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Daily Entries — Mobile Card Layout */}
              <div className="smer-mobile-cards" style={{ marginBottom: 16 }}>
                {dailyEntries.map((entry, idx) => (
                  <div key={idx} className="smer-card" style={entry.perdiem_override ? { borderColor: '#c4b5fd', background: '#faf5ff' } : entry.override_status === 'PENDING' ? { borderColor: '#fbbf24', background: '#fffbeb' } : entry.override_status === 'REJECTED' ? { borderColor: '#fca5a5', background: '#fef2f2' } : undefined}>
                    <div className="smer-card-header">
                      <div>
                        <span style={{ fontWeight: 600, fontSize: 15 }}>{entry.day_of_week}</span>
                        <span style={{ marginLeft: 8, color: 'var(--erp-muted, #5f7188)', fontSize: 13 }}>{displayDate(entry.entry_date)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, color: entry.perdiem_tier === 'FULL' ? '#16a34a' : entry.perdiem_tier === 'HALF' ? '#d97706' : '#9ca3af', background: entry.perdiem_tier === 'FULL' ? '#dcfce7' : entry.perdiem_tier === 'HALF' ? '#fef3c7' : '#f3f4f6' }}>
                          {entry.perdiem_tier} — ₱{(entry.perdiem_amount || 0).toLocaleString()}
                          {entry.perdiem_override && <span style={{ marginLeft: 4, color: '#7c3aed' }}>★</span>}
                        </span>
                        {entry.override_status === 'PENDING' && <span style={{ padding: '1px 5px', borderRadius: 4, fontSize: 9, fontWeight: 600, color: '#92400e', background: '#fef3c7' }}>PENDING</span>}
                        {entry.override_status === 'REJECTED' && <span style={{ padding: '1px 5px', borderRadius: 4, fontSize: 9, fontWeight: 600, color: '#991b1b', background: '#fee2e2' }}>REJECTED</span>}
                      </div>
                    </div>
                    <div className="smer-card-fields">
                      <div className="smer-card-field">
                        <label>Activity</label>
                        <select value={entry.activity_type || ''} onChange={e => handleEntryChange(idx, 'activity_type', e.target.value)}>
                          <option value="">—</option>
                          {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="smer-card-field">
                        <label>MDs / Eng.</label>
                        <input type="number" min={0} value={entry.md_count} onChange={e => handleEntryChange(idx, 'md_count', Number(e.target.value))} disabled={entry.activity_type === 'NO_WORK'} style={entry.activity_type === 'NO_WORK' ? { opacity: 0.4 } : undefined} />
                        {entry._flaggedExcluded > 0 && (
                          <div style={{ fontSize: 10, fontWeight: 600, color: '#9a3412', marginTop: 2 }}>{entry._flaggedExcluded} flagged not counted</div>
                        )}
                      </div>
                      <div className="smer-card-field full-width">
                        <label>Hospitals</label>
                        <HospitalChips entryIdx={idx} />
                      </div>
                      <div className="smer-card-field full-width">
                        <label>Notes</label>
                        <input placeholder="Details..." value={entry.notes || ''} onChange={e => handleEntryChange(idx, 'notes', e.target.value)} />
                      </div>
                      {/* P2P, Special, ORE — enter via Expenses (ORE) for mobile-friendly input */}
                      {entry.activity_type !== 'NO_WORK' && (
                      <div className="smer-card-field">
                        <label>Override</label>
                        {entry.perdiem_override ? (
                          isManagement ? (
                            <button onClick={() => handleRemoveOverride(idx)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #7c3aed', color: '#7c3aed', background: '#f5f3ff', cursor: 'pointer', fontSize: 12, width: '100%' }}>
                              Undo ({entry.override_reason?.slice(0, 20)})
                            </button>
                          ) : (
                            <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>★ Overridden</span>
                          )
                        ) : entry.override_status === 'PENDING' ? (
                          <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#92400e', background: '#fef3c7', display: 'block', textAlign: 'center' }}>Pending approval...</span>
                        ) : entry.override_status === 'REJECTED' ? (
                          <button onClick={() => handleOverride(idx)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ef4444', color: '#ef4444', background: '#fef2f2', cursor: 'pointer', fontSize: 12, width: '100%' }}>
                            Retry Override
                          </button>
                        ) : (
                          <button onClick={() => handleOverride(idx)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', color: 'var(--erp-muted)', background: '#fff', cursor: 'pointer', fontSize: 12, width: '100%' }}>
                            + Override
                          </button>
                        )}
                      </div>
                      )}
                    </div>
                  </div>
                ))}
                {/* Mobile totals */}
                <div className="smer-card" style={{ background: 'var(--erp-bg-alt, #f1f5f9)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, fontWeight: 600 }}>
                    <div>Per Diem: ₱{totals.perdiem.toLocaleString()}</div>
                    <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--erp-muted)' }}>Transport & ORE → <a href="/erp/expenses" style={{ color: '#2563eb' }}>enter in Expenses</a></div>
                  </div>
                </div>
              </div>

              {saveError && (
                <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 6, background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', fontSize: 13 }}>
                  {saveError}
                </div>
              )}
              <button onClick={handleSave} disabled={loading} style={{ padding: '8px 24px', borderRadius: 6, background: 'var(--erp-accent, #1e5eff)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                {editingSmer ? 'Update SMER' : 'Save SMER as Draft'}
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Override Request Modal */}
      {overrideModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }} onClick={() => !overrideSubmitting && setOverrideModal(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Override Per Diem — Day {overrideModal.entry?.day}</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--erp-muted, #5f7188)' }}>
              Current: {overrideModal.entry?.md_count || 0} engagements = {overrideModal.entry?.perdiem_tier} (₱{(overrideModal.entry?.perdiem_amount || 0).toLocaleString()})
            </p>

            {/* Info banner for non-management */}
            {!isManagement && !canWriteOnBehalf && (
              <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 6, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', fontSize: 12 }}>
                This override requires approval from your admin/president. You will be notified once a decision is made.
              </div>
            )}
            {/* Phase G4.5f — proxy info banner. Always force-routes to Approval
                Hub even when caller is management (Rule #20 four-eyes). */}
            {canWriteOnBehalf && (
              <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 6, background: '#f5f3ff', border: '1px solid #c4b5fd', color: '#6d28d9', fontSize: 12 }}>
                Proxy override on behalf of <strong>{bdmOptions.find(b => b._id === selectedBdmId)?.name || 'BDM'}</strong>. The request always routes through the Approval Hub (Rule #20 four-eyes), even when you have approve rights. The BDM receives a courtesy receipt when a decision is made.
              </div>
            )}

            {/* Tier selector */}
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--erp-muted, #5f7188)' }}>Override Tier</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {['FULL', 'HALF'].map(t => (
                <button key={t} type="button" onClick={() => setOverrideForm(f => ({ ...f, tier: t }))}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: `2px solid ${overrideForm.tier === t ? (t === 'FULL' ? '#16a34a' : '#d97706') : '#e5e7eb'}`, background: overrideForm.tier === t ? (t === 'FULL' ? '#dcfce7' : '#fef3c7') : '#fff', color: overrideForm.tier === t ? (t === 'FULL' ? '#166534' : '#92400e') : '#6b7280', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  {t} — ₱{(t === 'FULL' ? perdiemRate : Math.round(perdiemRate * 0.5)).toLocaleString()}
                </button>
              ))}
            </div>

            {/* Reason */}
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--erp-muted, #5f7188)' }}>Reason (required)</label>
            <textarea rows={3} placeholder='e.g. "Meeting with President", "Training day"' value={overrideForm.reason} onChange={e => setOverrideForm(f => ({ ...f, reason: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />

            {/* Phase G4.5f — proxy-only authorization tag. Required and non-empty
                after trim when canWriteOnBehalf. Persists on the daily entry +
                travels through ApprovalRequest.metadata so the Hub card shows
                what authorization the proxy claimed. */}
            {canWriteOnBehalf && (
              <>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginTop: 12, marginBottom: 4, color: '#6d28d9' }}>
                  Note about this submit (required for proxy)
                </label>
                <input type="text"
                  placeholder='e.g. "ok with boss", "in the office", "with client"'
                  value={overrideForm.bdm_phone_instruction}
                  maxLength={200}
                  onChange={e => setOverrideForm(f => ({ ...f, bdm_phone_instruction: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #c4b5fd', fontSize: 13, boxSizing: 'border-box', background: '#faf5ff' }} />
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--erp-muted, #5f7188)' }}>
                  Short tag is fine. Visible to approvers in the Hub and to the BDM in their inbox receipt.
                </div>
              </>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setOverrideModal(null)} disabled={overrideSubmitting}
                style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', color: 'var(--erp-muted)', cursor: 'pointer', fontSize: 13 }}>
                Cancel
              </button>
              <button type="button" onClick={handleOverrideSubmit}
                disabled={overrideSubmitting || !overrideForm.reason.trim() || (canWriteOnBehalf && !overrideForm.bdm_phone_instruction.trim())}
                style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: (isManagement && !canWriteOnBehalf) ? '#7c3aed' : '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, opacity: (overrideSubmitting || !overrideForm.reason.trim() || (canWriteOnBehalf && !overrideForm.bdm_phone_instruction.trim())) ? 0.5 : 1 }}>
                {overrideSubmitting ? 'Submitting...' : (isManagement && !canWriteOnBehalf) ? 'Apply Override' : 'Request Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
