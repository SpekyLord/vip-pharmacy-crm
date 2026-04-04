/**
 * CostCenterPicker — Phase 18
 *
 * Simple dropdown that fetches active cost centers and lets the user pick one.
 *
 * Props:
 *   value     — selected cost center _id
 *   onChange  — (costCenterId) => void
 *   disabled  — optional boolean
 */
import { useState, useEffect } from 'react';
import api from '../../services/api';

const styles = `
  .ccp-wrap { display: inline-flex; flex-direction: column; gap: 4px; }
  .ccp-label { font-size: 12px; font-weight: 600; color: var(--erp-muted, #64748b); }
  .ccp-select { padding: 7px 10px; border-radius: 6px; border: 1px solid var(--erp-border, #d1d5db); font-size: 13px; min-width: 200px; background: var(--erp-panel, #fff); }
  .ccp-select:disabled { background: var(--erp-accent-soft, #f0f4ff); opacity: 0.7; cursor: default; }
  .ccp-select:focus { outline: none; border-color: var(--erp-accent, #1e5eff); }
`;

export default function CostCenterPicker({ value, onChange, disabled = false, showLabel = true }) {
  const [costCenters, setCostCenters] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.get('/erp/cost-centers');
        const list = res?.data?.data || res?.data || [];
        if (!cancelled) {
          // Only show active cost centers
          const active = Array.isArray(list) ? list.filter(cc => cc.status !== 'INACTIVE') : [];
          setCostCenters(active);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  if (!loaded) return null;

  return (
    <div className="ccp-wrap">
      <style>{styles}</style>
      {showLabel && <label className="ccp-label">Cost Center</label>}
      <select
        className="ccp-select"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        disabled={disabled || costCenters.length === 0}
      >
        <option value="">-- Select Cost Center --</option>
        {costCenters.map(cc => (
          <option key={cc._id} value={cc._id}>
            {cc.code ? `${cc.code} — ` : ''}{cc.name || cc.cost_center_name || 'Unnamed'}
          </option>
        ))}
      </select>
    </div>
  );
}
