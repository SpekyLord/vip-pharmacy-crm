/**
 * AllocationPanel — Phase P1.2 Slice 4 (May 06 2026).
 *
 * Renders at the top of /erp/capture-hub when the BDM has unallocated prior
 * workdays in the current cycle. One row per workday, oldest-first.
 *
 * UX contract (Phase P1.2 plan, May 05 2026 evening):
 *   - Default state: Personal=Total, Official=0 (anti-fraud nudge — forces
 *     active reallocation).
 *   - Slider snaps to 5 km. Server-side pre-save snaps too — defense in depth.
 *   - "Did not drive" closes the gate cleanly with a NO_DRIVE row.
 *   - Missing-EndODO recovery: if today's Start KM is known (from prior
 *     allocations), the End KM input shows a one-tap "Use today's Start KM"
 *     suggestion that fills end_km AND flags end_km_auto_filled=true on the
 *     persisted row so admin can audit later.
 *   - Per-cycle gate: panel shows ALL unallocated workdays from cycle start
 *     through Manila yesterday; if BDM was gone 3 days, all 3 days appear
 *     oldest-first.
 *
 * Subscription readiness: gates ALLOCATE_PERSONAL_OFFICIAL + MARK_NO_DRIVE_DAY
 * via the API response (canAllocate / canMarkNoDrive) — server is source of
 * truth, panel disables the relevant CTAs when the role gate denies.
 *
 * The component is uncontrolled at the date level — each row keeps its own
 * { start_km, end_km, personal_km, end_km_auto_filled } draft state. On Save
 * we POST that single row's draft and remove it from `days` on success.
 */
import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
  Calendar, Camera, Coffee, RefreshCw, Save, ArrowRight, AlertTriangle, Lightbulb,
} from 'lucide-react';
import toast from 'react-hot-toast';
import useDriveAllocations from '../../hooks/useDriveAllocations';

const KM_SNAP = 5;
const snapKm = (v) => Math.round((Number(v) || 0) / KM_SNAP) * KM_SNAP;

function AllocationRow({
  day, todayStartKm, isLast, onAllocate, onNoDrive, canAllocate, canMarkNoDrive, busy,
}) {
  // Each row owns its draft state — independent of siblings.
  const [startKm, setStartKm] = useState(day.suggestedStartKm || '');
  const [endKm, setEndKm] = useState('');
  const [endAutoFilled, setEndAutoFilled] = useState(false);
  const [personalKm, setPersonalKm] = useState(0);
  const [showNoDriveConfirm, setShowNoDriveConfirm] = useState(false);

  const start = Number(startKm) || 0;
  const end = Number(endKm) || 0;
  const total = Math.max(0, end - start);

  // Anti-fraud default: when total changes, reset personal=total (Official=0).
  // Snap to 5 so the slider can land on it cleanly. Only re-default when the
  // BDM hasn't actively dragged the slider yet for this row OR total has
  // shrunk below the current personalKm.
  useEffect(() => {
    setPersonalKm(prev => {
      if (prev === 0 && total > 0) return snapKm(total);
      if (prev > total) return snapKm(total);
      return prev;
    });
  }, [total]);

  const useTodayStart = useCallback(() => {
    if (todayStartKm && todayStartKm > 0) {
      setEndKm(String(todayStartKm));
      setEndAutoFilled(true);
    }
  }, [todayStartKm]);

  const handleSave = useCallback(async () => {
    if (start <= 0 || end <= 0) {
      toast.error('Enter Start KM and End KM first.');
      return;
    }
    if (end < start) {
      toast.error('End KM cannot be less than Start KM.');
      return;
    }
    const snapped = snapKm(personalKm);
    try {
      await onAllocate({
        drive_date: day.date,
        start_km: start,
        end_km: end,
        end_km_auto_filled: endAutoFilled,
        personal_km: Math.min(snapped, total),
      });
      toast.success(`Allocated ${day.dayLabel}: ${snapped} pers / ${total - snapped} off`);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to allocate');
    }
  }, [start, end, personalKm, total, endAutoFilled, day.date, day.dayLabel, onAllocate]);

  const handleNoDrive = useCallback(async () => {
    try {
      await onNoDrive({ drive_date: day.date });
      toast.success(`Marked ${day.dayLabel} as no-drive day`);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to mark no-drive');
    } finally {
      setShowNoDriveConfirm(false);
    }
  }, [day.date, day.dayLabel, onNoDrive]);

  const officialKm = Math.max(0, total - snapKm(personalKm));

  return (
    <div className={`ap-row ${isLast ? 'ap-row-last' : ''}`}>
      <div className="ap-row-header">
        <div className="ap-row-date">
          <Calendar size={14} /> <strong>{day.dayLabel}</strong>
          {day.cycle && day.period && (
            <span
              className={`ap-cycle-tag ${day.priorCycle ? 'ap-cycle-tag-prior' : ''}`}
              title={day.priorCycle ? 'Prior cycle — within grace window' : 'Current cycle'}
            >
              {day.cycle} {day.period.slice(5)}
            </span>
          )}
        </div>
        <div className="ap-row-evidence">
          {day.smerCount > 0 && (
            <span className="ap-evidence-pill" title="ODO captures from this day">
              <Camera size={11} /> {day.smerCount} ODO
            </span>
          )}
          {day.fuelCount > 0 && (
            <span className="ap-evidence-pill" title="Fuel captures from this day">
              ⛽ {day.fuelCount}
            </span>
          )}
        </div>
      </div>

      {showNoDriveConfirm ? (
        <div className="ap-no-drive-confirm">
          <p>Mark <strong>{day.dayLabel}</strong> as a no-drive day?</p>
          <p className="ap-hint">No per-diem accrues. You can override later only via admin.</p>
          <div className="ap-actions">
            <button className="ap-btn-ghost" onClick={() => setShowNoDriveConfirm(false)} disabled={busy}>
              Cancel
            </button>
            <button className="ap-btn-warn" onClick={handleNoDrive} disabled={busy} data-testid={`ap-no-drive-confirm-${day.date}`}>
              {busy ? <RefreshCw size={14} className="ap-spin" /> : <Coffee size={14} />} Confirm no-drive
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="ap-km-row">
            <label className="ap-km-field">
              <span>Start KM</span>
              <input
                type="number"
                inputMode="numeric"
                value={startKm}
                onChange={(e) => setStartKm(e.target.value)}
                placeholder={day.suggestedStartKm ? String(day.suggestedStartKm) : '0'}
                disabled={!canAllocate || busy}
                data-testid={`ap-start-km-${day.date}`}
              />
            </label>
            <ArrowRight size={14} className="ap-arrow" />
            <label className="ap-km-field">
              <span>End KM {endAutoFilled && <em className="ap-auto">(auto)</em>}</span>
              <input
                type="number"
                inputMode="numeric"
                value={endKm}
                onChange={(e) => { setEndKm(e.target.value); setEndAutoFilled(false); }}
                placeholder="0"
                disabled={!canAllocate || busy}
                data-testid={`ap-end-km-${day.date}`}
              />
            </label>
          </div>

          {(!endKm || Number(endKm) === 0) && todayStartKm && todayStartKm > 0 && isLast && (
            <button
              type="button"
              className="ap-auto-fill-hint"
              onClick={useTodayStart}
              disabled={!canAllocate || busy}
              data-testid={`ap-auto-fill-${day.date}`}
            >
              <Lightbulb size={12} />
              Use today&apos;s Start KM ({todayStartKm}) — car parked overnight
            </button>
          )}

          <div className="ap-totals">
            <span>Total: <strong>{total}</strong> km</span>
            <span>Personal: <strong>{snapKm(personalKm)}</strong></span>
            <span>Official: <strong>{officialKm}</strong></span>
          </div>

          <input
            type="range"
            min={0}
            max={total > 0 ? total : 0}
            step={KM_SNAP}
            value={Math.min(snapKm(personalKm), total)}
            onChange={(e) => setPersonalKm(Number(e.target.value))}
            disabled={!canAllocate || busy || total === 0}
            className="ap-slider"
            aria-label="Personal km slider"
            data-testid={`ap-slider-${day.date}`}
          />
          <div className="ap-slider-legend">
            <span>← All Personal</span>
            <span>All Official →</span>
          </div>

          {snapKm(personalKm) === total && total > 0 && (
            <div className="ap-warn-default" role="note">
              <AlertTriangle size={12} />
              You&apos;re about to claim 0 official km. Drag the slider right if any of this drive was for work.
            </div>
          )}

          <div className="ap-actions">
            {canMarkNoDrive && (
              <button
                type="button"
                className="ap-btn-ghost"
                onClick={() => setShowNoDriveConfirm(true)}
                disabled={busy}
                data-testid={`ap-no-drive-${day.date}`}
              >
                <Coffee size={14} /> Did not drive
              </button>
            )}
            <button
              type="button"
              className="ap-btn-primary"
              onClick={handleSave}
              disabled={!canAllocate || busy || total === 0}
              data-testid={`ap-save-${day.date}`}
            >
              {busy ? <RefreshCw size={14} className="ap-spin" /> : <Save size={14} />} Save allocation
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const AllocationPanel = forwardRef(function AllocationPanel({ onChange }, ref) {
  const { getUnallocatedWorkdays, allocate, markNoDrive, loading } = useDriveAllocations();
  const [state, setState] = useState({
    days: [], currentCycle: null, today: null, todayStartKm: null,
    canAllocate: false, canMarkNoDrive: false, loaded: false,
  });

  const refresh = useCallback(async () => {
    try {
      const res = await getUnallocatedWorkdays();
      const data = res?.data || {};
      setState({
        days: Array.isArray(data.days) ? data.days : [],
        currentPeriod: data.currentPeriod ?? null,
        currentCycle: data.currentCycle ?? null,
        priorCycleOpen: !!data.priorCycleOpen,
        today: data.today ?? null,
        todayStartKm: data.todayStartKm ?? null,
        canAllocate: !!data.canAllocate,
        canMarkNoDrive: !!data.canMarkNoDrive,
        loaded: true,
      });
      onChange?.({
        unallocatedCount: (data.days || []).length,
        canAllocate: !!data.canAllocate,
        canMarkNoDrive: !!data.canMarkNoDrive,
      });
    } catch {
      // Silent — non-critical, server-side errors surfaced via toast in onSave/onNoDrive
      setState(s => ({ ...s, loaded: true }));
    }
  }, [getUnallocatedWorkdays, onChange]);

  useEffect(() => { refresh(); }, [refresh]);

  // Imperative refresh hook for the parent (BdmCaptureHub) so a successful
  // Quick Capture / classic capture can re-pull the unallocated count without
  // rendering the panel as controlled state.
  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  const handleAllocate = useCallback(async (body) => {
    await allocate(body);
    setState(s => ({ ...s, days: s.days.filter(d => d.date !== body.drive_date) }));
    onChange?.({
      unallocatedCount: state.days.filter(d => d.date !== body.drive_date).length,
      canAllocate: state.canAllocate,
      canMarkNoDrive: state.canMarkNoDrive,
    });
  }, [allocate, state.days, state.canAllocate, state.canMarkNoDrive, onChange]);

  const handleNoDrive = useCallback(async (body) => {
    await markNoDrive(body);
    setState(s => ({ ...s, days: s.days.filter(d => d.date !== body.drive_date) }));
    onChange?.({
      unallocatedCount: state.days.filter(d => d.date !== body.drive_date).length,
      canAllocate: state.canAllocate,
      canMarkNoDrive: state.canMarkNoDrive,
    });
  }, [markNoDrive, state.days, state.canAllocate, state.canMarkNoDrive, onChange]);

  if (!state.loaded) return null;
  if (state.days.length === 0) {
    const cycleLabel = state.currentCycle && state.currentPeriod
      ? `${state.currentCycle} ${state.currentPeriod}`
      : 'this cycle';
    return (
      <div className="ap-panel ap-empty" data-testid="ap-panel">
        <div className="ap-empty-row">
          <span>✓ All prior workdays in {cycleLabel} are allocated.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="ap-panel" data-testid="ap-panel" id="allocation-panel">
      <div className="ap-panel-header">
        <h3>Allocate prior drives</h3>
        <span className="ap-panel-count" data-testid="ap-unalloc-count">
          {state.days.length} day{state.days.length === 1 ? '' : 's'} pending
        </span>
      </div>
      <p className="ap-panel-sub">
        Default is <strong>0 official km</strong> — drag the slider right if any of the drive was for work.
        Mark <em>Did not drive</em> for non-driving days. ODO tile is locked until cleared.
      </p>
      {state.days.map((d, i) => (
        <AllocationRow
          key={d.date}
          day={d}
          todayStartKm={state.todayStartKm}
          isLast={i === state.days.length - 1}
          canAllocate={state.canAllocate}
          canMarkNoDrive={state.canMarkNoDrive}
          busy={loading}
          onAllocate={handleAllocate}
          onNoDrive={handleNoDrive}
        />
      ))}
    </div>
  );
});

export default AllocationPanel;
