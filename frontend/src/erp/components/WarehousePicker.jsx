/**
 * WarehousePicker — Phase 17
 *
 * Shared component used by all inventory-related pages.
 *
 * Behavior:
 *   - Fetches user's accessible warehouses on mount
 *   - If only 1 warehouse: auto-selects it, dropdown is disabled (but visible)
 *   - If multiple: enables dropdown, defaults to user's primary (manager) warehouse
 *   - President/admin see all warehouses and can switch freely
 *   - Emits onChange(warehouseId) to parent
 *
 * Props:
 *   value        — selected warehouse_id (controlled)
 *   onChange      — callback(warehouseId)
 *   entityId     — optional: filter to specific entity (for IC transfers)
 *   filterType   — optional: 'PHARMA' | 'FNB' | 'OFFICE' — filter by stock_type
 *   filterGrn    — optional: only show warehouses with can_receive_grn=true
 *   showLabel    — optional: show "Warehouse" label above (default true)
 *   compact      — optional: compact mode for inline use
 *   disabled     — optional: force disabled
 */
import { useState, useEffect, useCallback } from 'react';
import useWarehouses from '../hooks/useWarehouses';

const styles = `
  .whp-wrap { margin-bottom: 10px; }
  .whp-wrap.whp-compact { margin-bottom: 0; display: inline-flex; align-items: center; gap: 6px; }
  .whp-label { font-size: 12px; font-weight: 600; color: var(--erp-muted, #64748b); margin-bottom: 4px; display: block; }
  .whp-compact .whp-label { margin-bottom: 0; }
  .whp-select { padding: 7px 10px; border-radius: 6px; border: 1px solid var(--erp-border, #d1d5db); font-size: 13px; width: 100%; max-width: 320px; background: var(--erp-panel, #fff); }
  .whp-compact .whp-select { width: auto; max-width: none; }
  .whp-select:disabled { background: var(--erp-accent-soft, #f0f4ff); color: var(--erp-text, #1a1a2e); cursor: default; opacity: 0.85; }
  .whp-badge { display: inline-block; font-size: 10px; padding: 1px 6px; border-radius: 4px; margin-left: 6px; }
  .whp-badge-main { background: #dbeafe; color: #1e40af; }
  .whp-badge-primary { background: #dcfce7; color: #166534; }
  .whp-badge-locked { background: #f3f4f6; color: #6b7280; }
  @media (max-width: 768px) {
    .whp-wrap.whp-compact { width: 100%; display: block; }
    .whp-compact .whp-select { width: 100%; max-width: 100%; }
  }
`;

export default function WarehousePicker({
  value,
  onChange,
  entityId,
  filterType,
  filterGrn,
  showLabel = true,
  compact = false,
  disabled = false,
  allowAll = false,
}) {
  const whApi = useWarehouses();
  const [warehouses, setWarehouses] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = {};
      if (entityId) params.entity_id = entityId;
      const res = await whApi.getMyWarehouses(params);
      let list = res?.data || [];

      // Apply client-side filters
      if (filterType) list = list.filter(w => w.stock_type === filterType);
      if (filterGrn) list = list.filter(w => w.can_receive_grn);

      setWarehouses(list);

      // Auto-select if no value set (skip when allowAll — user can view all)
      if (!value && list.length > 0 && !allowAll) {
        // Prefer primary warehouse (user is manager)
        const primary = list.find(w => w.is_primary);
        onChange(primary ? primary._id : list[0]._id);
      }

      setLoaded(true);
    } catch {
      setLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, filterType, filterGrn]);

  useEffect(() => { load(); }, [load]);

  // If value doesn't match any warehouse (e.g., entity changed), reset (skip when allowAll)
  useEffect(() => {
    if (loaded && value && warehouses.length > 0 && !allowAll && !warehouses.find(w => w._id === value)) {
      const primary = warehouses.find(w => w.is_primary);
      onChange(primary ? primary._id : warehouses[0]._id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, value, warehouses]);

  const canSwitch = (warehouses.length > 1 || allowAll) && !disabled;
  const selected = warehouses.find(w => w._id === value);

  if (!loaded) return null;

  return (
    <div className={`whp-wrap${compact ? ' whp-compact' : ''}`}>
      <style>{styles}</style>
      {showLabel && <label className="whp-label">Warehouse</label>}
      <select
        className="whp-select"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        disabled={!canSwitch}
      >
        {allowAll && <option value="">All Warehouses</option>}
        {!allowAll && !value && <option value="">-- Select Warehouse --</option>}
        {warehouses.map(w => (
          <option key={w._id} value={w._id}>
            {w.warehouse_code} — {w.warehouse_name}
            {w.warehouse_type === 'MAIN' ? ' (Main)' : ''}
            {w.is_primary ? ' (Mine)' : ''}
          </option>
        ))}
      </select>
      {selected && !canSwitch && (
        <span className="whp-badge whp-badge-locked">Locked</span>
      )}
      {selected && selected.warehouse_type === 'MAIN' && canSwitch && (
        <span className="whp-badge whp-badge-main">Main WH</span>
      )}
    </div>
  );
}
