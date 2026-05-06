/**
 * PhysicalStatusOverrideSheet — Shared sheet for president-only flips of
 * paper-attestation status (RECEIVED ↔ MISSING ↔ PENDING).
 *
 * Used by:
 *   • CaptureArchive.jsx — opens from per-row "Override" link
 *   • ProxyQueue.jsx     — opens from drawer's "Override" affordance
 *
 * Apply is disabled when the picked status equals the current status (no-op
 * guard). Backend gates by OVERRIDE_PHYSICAL_STATUS (default `[president]`)
 * so a non-president caller would 403 server-side; the chip itself is hidden
 * by the page's frontend gate via `userHasFrontendDefault(user, 'OVERRIDE_PHYSICAL_STATUS')`.
 *
 * Props:
 *   currentStatus — 'PENDING' | 'RECEIVED' | 'MISSING' (current physical_status)
 *   onClose       — () => void
 *   onApply       — (next: 'PENDING' | 'RECEIVED' | 'MISSING') => void
 *   testIdPrefix  — optional prefix for data-testid hooks (default 'override')
 *                    so callers can disambiguate when both sheets co-exist.
 */
import { useState } from 'react';

const OPTIONS = ['PENDING', 'RECEIVED', 'MISSING'];

export default function PhysicalStatusOverrideSheet({
  currentStatus,
  onClose,
  onApply,
  testIdPrefix = 'override',
}) {
  const [next, setNext] = useState(currentStatus || 'PENDING');
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      data-testid={`${testIdPrefix}-sheet`}
    >
      <div className="bg-white w-full sm:max-w-sm sm:rounded-xl rounded-t-xl p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Override physical status</h3>
        <p className="text-xs text-gray-500 mb-4">
          President-only. Use when paper arrives late OR a previous attestation was a mistake.
        </p>
        <div className="space-y-2 mb-5">
          {OPTIONS.map(opt => (
            <button
              key={opt}
              onClick={() => setNext(opt)}
              className={`w-full text-left px-3 py-2 rounded-lg border ${
                next === opt
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-medium'
                  : 'bg-white border-gray-200 hover:bg-gray-50'
              }`}
              data-testid={`${testIdPrefix}-option-${opt}`}
            >
              {opt}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            data-testid={`${testIdPrefix}-cancel`}
          >
            Cancel
          </button>
          <button
            onClick={() => onApply(next)}
            disabled={next === currentStatus}
            className="flex-1 px-3 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
            data-testid={`${testIdPrefix}-apply`}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
