/**
 * ScheduleVisitsModal — Phase A.6 (May 05 2026)
 *
 * Admin-driven scheduling surface. Three modes:
 *
 *   mode = 'create'        — Add VIP / Upgrade to VIP. Pre-filled dates the
 *                            admin can edit. On confirm, parent sends dates to
 *                            POST /api/doctors with `initialSchedule`.
 *
 *   mode = 'schedule'      — VIP already exists but has no upcoming entries
 *                            (the "Needs scheduling" badge). On confirm,
 *                            parent calls scheduleService.adminCreate.
 *
 *   mode = 'reschedule'    — VIP has 1+ upcoming entries. Modal lists each
 *                            entry as one date picker; on confirm parent calls
 *                            scheduleService.adminReschedule per changed row.
 *
 * Props:
 *   open: boolean
 *   doctor: { _id, firstName, lastName, visitFrequency }
 *   assignedTo: ObjectId | null  — required for create/schedule, ignored on reschedule
 *   mode: 'create' | 'schedule' | 'reschedule'
 *   existingEntries: Array<Schedule> — only used when mode='reschedule'
 *   defaultDates: Array<{ date, week, day }> — only used when mode='create'/'schedule'
 *   onConfirm: ({ dates, changes, mode }) => Promise<void>
 *   onClose: () => void
 *   busy: boolean — disables Confirm while parent's API call is in flight
 *
 * Smart-default generation lives backend-side (scheduleSlotMapper.generateDefaultDates),
 * but the parent passes the resolved dates so this modal stays presentational.
 *
 * Client-side validation (must be Mon-Fri, alternating-week for 2x/mo, no past
 * dates) is duplicated from backend so the user gets immediate feedback. The
 * backend remains the authority on collision/race-condition rejection.
 */

import { useState, useMemo, useEffect } from 'react';

const modalStyles = `
  .svm-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000; padding: 16px;
  }
  .svm-card {
    background: white; border-radius: 8px; max-width: 560px; width: 100%;
    max-height: 90vh; overflow-y: auto; box-shadow: 0 8px 24px rgba(0,0,0,0.2);
  }
  .svm-header {
    padding: 18px 22px; border-bottom: 1px solid #e5e7eb;
  }
  .svm-title { margin: 0 0 4px; font-size: 18px; font-weight: 600; color: #1f2937; }
  .svm-subtitle { margin: 0; font-size: 13px; color: #6b7280; }
  .svm-body { padding: 18px 22px; }
  .svm-row {
    display: flex; gap: 10px; align-items: flex-end; margin-bottom: 12px;
    padding: 10px; border-radius: 6px; background: #f9fafb;
  }
  .svm-row.is-error { background: #fef2f2; border: 1px solid #fecaca; }
  .svm-row label { display: flex; flex-direction: column; gap: 4px; flex: 1; }
  .svm-row label > span { font-size: 12px; color: #4b5563; font-weight: 500; }
  .svm-row input[type="date"] {
    padding: 7px 10px; border: 1px solid #d1d5db; border-radius: 6px;
    font-size: 14px; min-width: 160px;
  }
  .svm-slot-label {
    font-size: 11px; padding: 2px 8px; border-radius: 999px;
    background: #ede9fe; color: #6d28d9; font-weight: 600;
    align-self: center; min-width: 50px; text-align: center;
  }
  .svm-existing-status {
    font-size: 11px; padding: 2px 8px; border-radius: 999px;
    background: #f3f4f6; color: #374151; font-weight: 500;
    align-self: center;
  }
  .svm-existing-status.is-carried { background: #fef3c7; color: #b45309; }
  .svm-error-msg { color: #dc2626; font-size: 12px; margin-top: 6px; }
  .svm-info {
    background: #eff6ff; border-left: 3px solid #3b82f6;
    padding: 8px 12px; font-size: 12px; color: #1e40af; margin-bottom: 14px;
    border-radius: 4px;
  }
  .svm-warn {
    background: #fef3c7; border-left: 3px solid #f59e0b;
    padding: 8px 12px; font-size: 12px; color: #92400e; margin-bottom: 14px;
    border-radius: 4px;
  }
  .svm-footer {
    padding: 14px 22px; border-top: 1px solid #e5e7eb;
    display: flex; justify-content: flex-end; gap: 10px;
  }
  .svm-btn {
    padding: 8px 16px; border-radius: 6px; font-size: 14px;
    font-weight: 500; border: 1px solid transparent; cursor: pointer;
  }
  .svm-btn-cancel { background: white; color: #374151; border-color: #d1d5db; }
  .svm-btn-confirm { background: #6d28d9; color: white; }
  .svm-btn-confirm:disabled { background: #9ca3af; cursor: not-allowed; }
`;

const todayIso = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const isWorkDayIso = (iso) => {
  if (!iso) return false;
  // Construct as local date; 'YYYY-MM-DD' interpreted as local midnight.
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay();
  return day >= 1 && day <= 5;
};

const weekFromIso = (iso, anchorIso = '2026-01-05') => {
  // Mirrors backend's getWeekOfMonth using Manila-local arithmetic.
  // For UI prefill the modal already knows the week, but on user-edited dates
  // we need to recompute to validate the alternating-week rule visually.
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const [ay, am, ad] = anchorIso.split('-').map(Number);
  const anchor = Date.UTC(ay, am - 1, ad);
  const diffDays = Math.floor((target - anchor) / 86400000);
  const dayInCycle = ((diffDays % 28) + 28) % 28;
  return Math.floor(dayInCycle / 7) + 1;
};

const ScheduleVisitsModal = ({
  open,
  doctor,
  mode,
  existingEntries = [],
  defaultDates = [],
  onConfirm,
  onClose,
  busy = false,
}) => {
  // Each row's state shape:
  //   create/schedule: { id: synthetic, date }
  //   reschedule:      { id: scheduleId, date, originalDate, status }
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!open) return;
    if (mode === 'reschedule') {
      // Map existing entries → rows with the implied calendar date for each.
      // Backend authority: cycleStart + (week-1)*7 + (day-1) days.
      setRows(
        existingEntries.map((e) => {
          const cycleStart = new Date(e.cycleStart);
          const dt = new Date(cycleStart);
          dt.setUTCDate(dt.getUTCDate() + (e.scheduledWeek - 1) * 7 + (e.scheduledDay - 1));
          const yyyy = dt.getUTCFullYear();
          const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
          const dd = String(dt.getUTCDate()).padStart(2, '0');
          const iso = `${yyyy}-${mm}-${dd}`;
          return {
            id: e._id,
            date: iso,
            originalDate: iso,
            status: e.status,
            label: e.scheduledLabel,
          };
        })
      );
    } else {
      setRows(defaultDates.map((d, idx) => ({ id: `s${idx}`, date: d.date })));
    }
  }, [open, mode, existingEntries, defaultDates]);

  const handleDateChange = (rowId, newDate) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, date: newDate } : r)));
  };

  // Compute per-row + cross-row validation.
  const validation = useMemo(() => {
    const perRow = {};
    const today = todayIso();
    rows.forEach((r) => {
      if (!r.date) {
        perRow[r.id] = 'Pick a date';
        return;
      }
      if (!isWorkDayIso(r.date)) {
        perRow[r.id] = 'Must be Mon-Fri';
        return;
      }
      if (mode !== 'reschedule' && r.date < today) {
        perRow[r.id] = 'Date is in the past';
        return;
      }
    });
    // Duplicate-date guard
    const seen = new Map();
    rows.forEach((r) => {
      if (!r.date) return;
      if (seen.has(r.date)) {
        perRow[r.id] = perRow[r.id] || 'Duplicate of another row';
      }
      seen.set(r.date, r.id);
    });
    // Alternating-week rule for 2x/mo VIPs
    if (doctor?.visitFrequency === 2) {
      const weeks = rows.map((r) => ({ id: r.id, week: weekFromIso(r.date) })).filter((x) => x.week);
      // Group by 28-day cycle to be precise; cheap approximation: just use the absolute week number.
      const weekNums = weeks.map((w) => w.week).sort((a, b) => a - b);
      const validPairs = [
        [1, 3].toString(),
        [2, 4].toString(),
      ];
      if (weekNums.length === 2 && !validPairs.includes(weekNums.toString())) {
        weeks.forEach((w) => {
          perRow[w.id] = perRow[w.id] || '2x/mo VIPs must alternate (W1+W3 or W2+W4)';
        });
      }
    }
    const valid = Object.keys(perRow).length === 0 && rows.every((r) => r.date);
    return { perRow, valid };
  }, [rows, mode, doctor]);

  if (!open) return null;

  const titleMap = {
    create: 'Schedule visits for new VIP',
    schedule: 'Schedule visits',
    reschedule: 'Reschedule visits',
  };
  const subtitleMap = {
    create: `${doctor?.firstName || ''} ${doctor?.lastName || ''} — pick the date(s) for the upcoming cycle.`,
    schedule: `${doctor?.firstName || ''} ${doctor?.lastName || ''} has no upcoming visits scheduled. Pick dates below.`,
    reschedule: `Move ${doctor?.firstName || ''} ${doctor?.lastName || ''}'s upcoming visit(s) to new dates.`,
  };

  const handleConfirm = async () => {
    if (!validation.valid || busy) return;
    if (mode === 'reschedule') {
      const changes = rows
        .filter((r) => r.date !== r.originalDate)
        .map((r) => ({ id: r.id, date: r.date }));
      if (changes.length === 0) {
        onClose();
        return;
      }
      await onConfirm({ mode, changes });
    } else {
      const dates = rows.map((r) => ({ date: r.date }));
      await onConfirm({ mode, dates });
    }
  };

  return (
    <div className="svm-overlay" role="dialog" aria-modal="true" data-testid="schedule-visits-modal">
      <style>{modalStyles}</style>
      <div className="svm-card">
        <div className="svm-header">
          <h3 className="svm-title">{titleMap[mode]}</h3>
          <p className="svm-subtitle">{subtitleMap[mode]}</p>
        </div>
        <div className="svm-body">
          {doctor?.visitFrequency === 2 && (
            <div className="svm-info">
              This is a <strong>2x/mo VIP</strong> — visits must alternate weeks (W1+W3 or W2+W4).
            </div>
          )}
          {mode === 'reschedule' && rows.some((r) => r.status === 'carried') && (
            <div className="svm-warn">
              Some entries below were <strong>carried</strong> from earlier weeks. Rescheduling clears the carry flag if you move them out of this cycle.
            </div>
          )}
          {rows.length === 0 && (
            <p style={{ color: '#6b7280' }}>No upcoming entries.</p>
          )}
          {rows.map((r, idx) => {
            const errMsg = validation.perRow[r.id];
            return (
              <div key={r.id} className={`svm-row ${errMsg ? 'is-error' : ''}`}>
                <span className="svm-slot-label">
                  {mode === 'reschedule' ? r.label : `Visit ${idx + 1}`}
                </span>
                <label>
                  <span>Date</span>
                  <input
                    type="date"
                    value={r.date}
                    min={mode === 'reschedule' ? undefined : todayIso()}
                    onChange={(e) => handleDateChange(r.id, e.target.value)}
                    data-testid={`svm-date-${idx}`}
                  />
                  {errMsg && <span className="svm-error-msg">{errMsg}</span>}
                </label>
                {mode === 'reschedule' && r.status && (
                  <span className={`svm-existing-status ${r.status === 'carried' ? 'is-carried' : ''}`}>
                    {r.status}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="svm-footer">
          <button type="button" className="svm-btn svm-btn-cancel" onClick={onClose} disabled={busy}>
            {mode === 'create' ? 'Skip — schedule later' : 'Cancel'}
          </button>
          <button
            type="button"
            className="svm-btn svm-btn-confirm"
            onClick={handleConfirm}
            disabled={!validation.valid || busy}
            data-testid="svm-confirm"
          >
            {busy ? 'Saving…' : mode === 'reschedule' ? 'Save changes' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScheduleVisitsModal;
