/**
 * Per-request AsyncLocalStorage context.
 *
 * Threads request metadata into anything that runs inside the request —
 * including Mongoose query hooks via `entityGuard` / `bdmGuard`. Used by
 * Day-3 stabilization to surface Rule #21 silent-self-fill bugs and missing
 * entity_id filters in observation mode.
 *
 * Wiring (single point):
 *   `requestContextRoot` mounts as the first middleware after `attachRequestId`.
 *   It opens an AsyncLocalStorage scope for the lifetime of the request and
 *   stores the live `req` reference. Auth and tenant-filter middleware mutate
 *   `req` later in the chain; the guards read those mutations directly off
 *   `req` at hook time, so we don't need a second decorator middleware mounted
 *   at every route group.
 *
 * Background jobs run OUTSIDE any request — `getStore()` is `undefined` and
 * the guards skip them. Intentional for Day 3 (audit request-driven traffic).
 */

const { AsyncLocalStorage } = require('async_hooks');

const requestContext = new AsyncLocalStorage();

const requestContextRoot = (req, res, next) => {
  const initial = {
    req,
    requestId: req.requestId || null,
    requestPath: `${req.method} ${req.originalUrl}`,
    crossEntityAllowed: false,
  };
  requestContext.run(initial, () => next());
};

/**
 * Read live auth/tenant fields off `req` at hook time. The values may be
 * undefined for routes without auth or without ERP tenantFilter — the
 * guards handle that.
 */
const readLiveCtx = () => {
  const store = requestContext.getStore();
  if (!store) return null;
  const { req } = store;
  return {
    requestId: store.requestId,
    requestPath: store.requestPath,
    crossEntityAllowed: store.crossEntityAllowed,
    userId: req?.user?._id ? req.user._id.toString() : null,
    userRole: req?.user?.role || null,
    entityId: req?.entityId ? req.entityId.toString() : null,
    isPrivileged: !!(req?.isPresident || req?.isAdmin || req?.isFinance),
    bdmIdInQuery:
      typeof req?.query?.bdm_id === 'string' && req.query.bdm_id.length > 0,
  };
};

/**
 * Routes that legitimately span entities (consolidated finance reports,
 * approval-hub cross-entity views) call this to silence the guards for the
 * rest of the request. Day 3 ships only the helper — Day 4 triage marks
 * known-good routes once we know which ones they are.
 */
const markCrossEntityAllowed = (req, reason = 'unspecified') => {
  const store = requestContext.getStore();
  if (store) {
    store.crossEntityAllowed = true;
    store.crossEntityReason = reason;
  }
};

/**
 * Per-call cross-entity scope. Use when a single utility function needs to
 * sweep across entities (e.g. resolving warehouse codes during import) but
 * the *caller's* request must keep its tenant scoping. Saves and restores
 * the prior `crossEntityAllowed` state around `fn()`.
 *
 * Outside a request context (CLI scripts, cron jobs) this is a no-op
 * passthrough — the guards already skip when the AsyncLocalStorage store
 * is empty.
 */
const withCrossEntityScope = async (reason, fn) => {
  const store = requestContext.getStore();
  if (!store) return fn();
  const prevAllowed = store.crossEntityAllowed;
  const prevReason = store.crossEntityReason;
  store.crossEntityAllowed = true;
  store.crossEntityReason = reason;
  try {
    return await fn();
  } finally {
    store.crossEntityAllowed = prevAllowed;
    store.crossEntityReason = prevReason;
  }
};

module.exports = {
  requestContext,
  requestContextRoot,
  readLiveCtx,
  markCrossEntityAllowed,
  withCrossEntityScope,
};
