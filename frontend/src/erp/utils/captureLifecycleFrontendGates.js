/**
 * captureLifecycleFrontendGates.js — Shared frontend mirror of
 * `backend/utils/captureLifecycleAccess.js` DEFAULTS.
 *
 * The backend is the source of truth (returns 403 on perm fail). The
 * frontend mirror exists for cosmetic show/hide so the UI doesn't render
 * controls the user can't act on. When the lookup row diverges from the
 * inline DEFAULTS, the backend is still authoritative — the worst case is
 * a user clicks a button that 403s, which is a recoverable UX miss, not a
 * security issue.
 *
 * Why the extraction:
 * Both `CaptureArchive.jsx` and `ProxyQueue.jsx` were carrying their own
 * `FRONTEND_DEFAULTS` const + `userHasFrontendDefault()` helper. Two copies
 * of the same role-array map will drift the moment one gets edited.
 *
 * If this drifts from `backend/utils/captureLifecycleAccess.js` DEFAULTS
 * the cosmetic gating will mismatch the API gating. Keep both in sync.
 * Long-term option: have the auth context fetch effective gates per session
 * and expose them as a synchronous map — that removes the mirror entirely.
 */

import { ROLES } from '../../constants/roles';

export const FRONTEND_DEFAULTS = Object.freeze({
  UPLOAD_OWN_CAPTURE:           [ROLES.STAFF],
  VIEW_OWN_ARCHIVE:             [ROLES.STAFF],
  VIEW_ALL_ARCHIVE:             [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT],
  MARK_PAPER_RECEIVED:          [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT],
  BULK_MARK_RECEIVED:           [ROLES.ADMIN, ROLES.PRESIDENT],
  OVERRIDE_PHYSICAL_STATUS:     [ROLES.PRESIDENT],
  GENERATE_CYCLE_REPORT:        [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT],
  MARK_NO_DRIVE_DAY:            [ROLES.STAFF],
  ALLOCATE_PERSONAL_OFFICIAL:   [ROLES.STAFF],
  OVERRIDE_ALLOCATION:          [ROLES.ADMIN, ROLES.PRESIDENT],
  EDIT_CAR_LOGBOOK_DESTINATION: [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT],
  PROXY_PULL_CAPTURE:           [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT],
});

/**
 * Synchronous predicate: does this user role appear in the frontend mirror
 * of `code`'s default role list? President bypasses always (Rule #20).
 *
 * Returns false on missing user / unknown code (fail closed).
 */
export function userHasFrontendDefault(user, code) {
  if (!user || !user.role) return false;
  if (user.role === ROLES.PRESIDENT) return true;
  return (FRONTEND_DEFAULTS[code] || []).includes(user.role);
}
