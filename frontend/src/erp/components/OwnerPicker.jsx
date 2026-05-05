import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import useErpSubAccess from '../hooks/useErpSubAccess';
import { useLookupOptions } from '../hooks/useLookups';
import usePeople from '../hooks/usePeople';

/**
 * OwnerPicker — Phase G4.5a (April 2026).
 *
 * Renders a "Record on behalf of" dropdown for admin/finance/back-office
 * contractors who have proxy-entry rights for the given module. Renders
 * nothing (null) when the caller is not eligible, so callers can mount it
 * unconditionally.
 *
 * Eligibility (matches backend resolveOwnerScope.js):
 *   1. Role ∈ PROXY_ENTRY_ROLES.<MODULE>.metadata.roles (lookup-driven)
 *   2. erp_access.sub_permissions.<module>.<subKey> is ticked
 *   President always passes. CEO always denied.
 *
 * Props:
 *   - module: string  e.g. 'sales'
 *   - subKey: string  e.g. 'proxy_entry' or 'opening_ar_proxy'
 *   - moduleLookupCode: string (optional) — lookup code under PROXY_ENTRY_ROLES,
 *       defaults to module.toUpperCase(). For Opening AR pass 'OPENING_AR'.
 *   - value: string — currently selected user _id (empty = self)
 *   - onChange: (userId) => void
 *   - disabled: boolean
 *   - label: string (optional) — defaults to "Record on behalf of"
 */
export default function OwnerPicker({
  module,
  subKey = 'proxy_entry',
  moduleLookupCode,
  value,
  onChange,
  disabled = false,
  label = 'Record on behalf of',
}) {
  const { user } = useAuth();
  const { hasSubPermission } = useErpSubAccess();
  const { options: proxyRolesOpts, loading: rolesLoading } = useLookupOptions('PROXY_ENTRY_ROLES');
  const { options: validOwnerOpts, loading: validOwnerLoading } = useLookupOptions('VALID_OWNER_ROLES');
  const { getProxyRoster } = usePeople();
  const [people, setPeople] = useState([]);
  const [peopleLoading, setPeopleLoading] = useState(false);

  const lookupCode = (moduleLookupCode || String(module || '').toUpperCase());

  // Resolve eligible roles from lookup. Falls back to admin/finance/president
  // (matches backend default) if the lookup hasn't seeded yet for this entity.
  const rolesRow = proxyRolesOpts.find(o => o.code === lookupCode);
  const eligibleRoles = Array.isArray(rolesRow?.metadata?.roles) && rolesRow.metadata.roles.length
    ? rolesRow.metadata.roles
    : ['admin', 'finance', 'president'];

  // VALID_OWNER_ROLES — who can be the owner of a per-BDM record in this module.
  // Backend default matches resolveOwnerScope.js (['staff']).
  // Phase S2 (Apr 2026): was ['contractor', 'employee'] — both renamed to 'staff'.
  const validOwnerRow = validOwnerOpts.find(o => o.code === lookupCode);
  const validOwnerRoles = Array.isArray(validOwnerRow?.metadata?.roles) && validOwnerRow.metadata.roles.length
    ? validOwnerRow.metadata.roles
    : ['staff'];

  const role = user?.role;
  const isPresident = role === 'president';
  const isCeo = role === 'ceo';
  const roleEligible = isPresident || (!isCeo && eligibleRoles.includes(role));
  const subTicked = isPresident || hasSubPermission(module, subKey);
  const canProxy = roleEligible && subTicked;
  // Phase G4.5d: if the caller's own role isn't a valid owner (e.g. admin,
  // finance, president), self-file would create orphaned ownership. Hide the
  // Self option so the dropdown forces a BDM selection — matches the backend
  // Rule #21 guard in resolveOwnerScope.js.
  const callerIsValidOwner = validOwnerRoles.includes(role);
  // Phase G4.5ff (May 5 2026) — gate is now lookup-driven only (Rule #3).
  // Earlier code added `&& !callerIsValidOwner` here to suppress a /erp/people
  // 403 storm. That gate over-filtered: even when admin had explicitly extended
  // PROXY_ENTRY_ROLES.<MODULE> to include 'staff' AND granted the sub-permission,
  // BDMs could not see the picker. Fix: (1) keep the picker visible for any
  // canProxy caller, (2) source the roster from /erp/proxy-roster — a narrow
  // endpoint that doesn't require people-module access — so the original 403
  // worry no longer applies.
  const showPicker = canProxy;

  useEffect(() => {
    let alive = true;
    if (!showPicker) return;
    (async () => {
      setPeopleLoading(true);
      try {
        const res = await getProxyRoster(lookupCode, { subKey });
        if (!alive) return;
        setPeople(res?.data || []);
      } catch (err) {
        console.warn('[OwnerPicker] getProxyRoster failed:', err?.message);
      } finally {
        if (alive) setPeopleLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [showPicker, getProxyRoster, lookupCode, subKey]);

  if (rolesLoading || validOwnerLoading) return null;
  if (!showPicker) return null;

  const selfLabel = callerIsValidOwner
    ? `Self — ${user?.name || 'me'} (${role})`
    : `— Select a BDM —`;
  const titleHint = callerIsValidOwner
    ? 'Choose whose record this will belong to. Leave on Self to file under your own id.'
    : `Role '${role}' cannot own per-${module} records. Pick the BDM who owns this transaction.`;

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, minWidth: 220 }}>
      <label style={{ fontSize: 11, color: '#6d28d9', fontWeight: 600 }}>
        {label}
        <span style={{ color: '#9ca3af', fontWeight: 400, marginLeft: 4 }}>
          {callerIsValidOwner ? '(proxy)' : '(required)'}
        </span>
      </label>
      <select
        value={value || ''}
        onChange={e => onChange?.(e.target.value || '')}
        disabled={disabled || peopleLoading}
        style={{
          padding: '6px 10px',
          borderRadius: 6,
          border: `1px solid ${callerIsValidOwner ? '#a78bfa' : '#f59e0b'}`,
          fontSize: 13,
          background: disabled ? '#f3f4f6' : '#fff',
        }}
        title={titleHint}
      >
        <option value="">{selfLabel}</option>
        {people
          // Phase G4.5ff (May 5 2026) — backend /erp/proxy-roster already
          // filters by VALID_OWNER_ROLES.<MODULE>.metadata.roles + entity scope
          // and excludes the caller. Defensive client-side filter retained so a
          // stale/cached lookup row can't surface admin/finance/president as
          // valid owners (would orphan per-BDM KPIs).
          .filter((p) => validOwnerRoles.includes(p.role))
          .map((p) => (
            <option key={String(p._id)} value={String(p._id)}>
              {p.name || String(p._id)}
            </option>
          ))}
      </select>
    </div>
  );
}
