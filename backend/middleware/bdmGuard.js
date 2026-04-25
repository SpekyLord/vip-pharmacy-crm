/**
 * BDM Guard — Rule #21 silent-self-fill detector (Day 3 + Day 4 of Week-1
 * Stabilization).
 *
 * Catches the bug class CLAUDE.md Rule #21 documents:
 *
 *     // WRONG: president without ?bdm_id= gets filtered to their own (non-BDM)
 *     // _id → empty results
 *     const bdmId = (privileged && req.query.bdm_id) ? req.query.bdm_id : req.bdmId;
 *
 * Runtime fingerprint:
 *   - the user is privileged (admin / finance / president)
 *   - the query filter contains `bdm_id`
 *   - the bdm_id value equals the requesting user's own _id
 *   - the request did NOT include `?bdm_id=` (so the value isn't an explicit
 *     scope choice — it leaked from a fallback)
 *
 * Modes (env var `BDM_GUARD_MODE`, read once at attach time):
 *   - `log`   (default): console.error JSON line; in production, also fire a
 *               deduped MessageInbox alert via guardAlerter.
 *   - `throw`: console.error JSON line + throw inside the Mongoose pre-hook.
 *               Use AFTER triage. The bug class is hard to clear from history
 *               (every existing buggy controller would 500 immediately) — flip
 *               to throw only once Phase G4.5d-style sweeps cover all 9
 *               Rule-#21 endpoints.
 *   - `off`:  plugin not registered.
 *
 * False positives are unlikely in this codebase: admin / finance / president
 * are not BDMs on transactional records. If a real one shows up, mark the
 * route via `markCrossEntityAllowed(req)` or fix the controller per Rule #21.
 *
 * Attached only to `strict_entity_and_bdm` models — the bucket where the bug
 * class can occur.
 */

const mongoose = require('mongoose');
const path = require('path');

const { readLiveCtx } = require('./requestContext');
const { maybeAlert } = require('./guardAlerter');

const VALID_MODES = ['log', 'throw', 'off'];
const resolveMode = () => {
  const raw = (process.env.BDM_GUARD_MODE || 'log').toLowerCase();
  if (!VALID_MODES.includes(raw)) {
    // eslint-disable-next-line no-console
    console.warn(`[bdmGuard] Invalid BDM_GUARD_MODE="${raw}" — defaulting to 'log'.`);
    return 'log';
  }
  return raw;
};

const QUERY_HOOKS = [
  'find',
  'findOne',
  'count',
  'countDocuments',
  'distinct',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'findOneAndDelete',
];

const extractBdmIdValue = (filter, depth = 0) => {
  if (!filter || typeof filter !== 'object' || depth > 3) return undefined;
  if (Object.prototype.hasOwnProperty.call(filter, 'bdm_id')) {
    const v = filter.bdm_id;
    if (v === null || v === undefined) return undefined;
    if (typeof v === 'string' || typeof v === 'object') return v;
    return undefined;
  }
  for (const key of ['$and', '$or', '$nor']) {
    const arr = filter[key];
    if (Array.isArray(arr)) {
      for (const sub of arr) {
        const found = extractBdmIdValue(sub, depth + 1);
        if (found !== undefined) return found;
      }
    }
  }
  return undefined;
};

const extractBdmFromPipeline = (pipeline) => {
  if (!Array.isArray(pipeline)) return undefined;
  for (const stage of pipeline) {
    if (stage && typeof stage === 'object' && stage.$match) {
      const found = extractBdmIdValue(stage.$match);
      if (found !== undefined) return found;
    }
  }
  return undefined;
};

const isSelfFill = (bdmValue, userId) => {
  if (!bdmValue || !userId) return false;

  if (typeof bdmValue === 'string') {
    return bdmValue === userId;
  }
  // ObjectId
  if (bdmValue && typeof bdmValue.toString === 'function' && !Array.isArray(bdmValue)) {
    const asStr = bdmValue.toString();
    if (asStr === userId) return true;
  }
  // { $eq: id }
  if (bdmValue && typeof bdmValue === 'object' && bdmValue.$eq !== undefined) {
    return isSelfFill(bdmValue.$eq, userId);
  }
  return false;
};

const buildShortStack = () => {
  const raw = new Error().stack || '';
  return raw
    .split('\n')
    .slice(2)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line.startsWith('at ')) return false;
      if (line.includes('node_modules')) return false;
      if (line.includes('node:internal')) return false;
      if (line.includes('entityGuard.js')) return false;
      if (line.includes('bdmGuard.js')) return false;
      return true;
    })
    .slice(0, 8)
    .map((line) => line.replace(process.cwd(), '.'));
};

const emitViolation = (payload, mode) => {
  // eslint-disable-next-line no-console
  console.error('[BDM_GUARD_VIOLATION]', JSON.stringify(payload));

  if (mode === 'throw') {
    const err = new Error(
      `[BDM_GUARD] ${payload.kind} on model ${payload.model} at ${payload.path || 'unknown path'} (op=${payload.op})`
    );
    err.code = 'BDM_GUARD_VIOLATION';
    err.violation = payload;
    throw err;
  }

  maybeAlert({
    kind: payload.kind,
    model: payload.model,
    requestPath: payload.path,
    payload,
  });
};

const buildPlugin = (bdmScopedSet, mode) => {
  const queryHookFn = function bdmQueryHook() {
    const ctx = readLiveCtx();
    if (!ctx) return;
    if (!ctx.isPrivileged) return;
    if (ctx.bdmIdInQuery) return; // explicit ?bdm_id= → not silent-fill

    const modelName = this.model && this.model.modelName;
    if (!modelName || !bdmScopedSet.has(modelName)) return;

    const filter = typeof this.getFilter === 'function' ? this.getFilter() : (this._conditions || {});
    const bdmValue = extractBdmIdValue(filter);
    if (!isSelfFill(bdmValue, ctx.userId)) return;

    emitViolation({
      ts: new Date().toISOString(),
      kind: 'bdm_silent_self_fill',
      model: modelName,
      op: this.op || 'query',
      path: ctx.requestPath,
      requestId: ctx.requestId,
      userId: ctx.userId,
      role: ctx.userRole || null,
      entityId: ctx.entityId,
      filterKeys: Object.keys(filter || {}).slice(0, 12),
      stack: buildShortStack(),
    }, mode);
  };

  const aggregateHookFn = function bdmAggregateHook() {
    const ctx = readLiveCtx();
    if (!ctx) return;
    if (!ctx.isPrivileged) return;
    if (ctx.bdmIdInQuery) return;

    const modelName = this._model && this._model.modelName;
    if (!modelName || !bdmScopedSet.has(modelName)) return;

    const pipeline = typeof this.pipeline === 'function' ? this.pipeline() : [];
    const bdmValue = extractBdmFromPipeline(pipeline);
    if (!isSelfFill(bdmValue, ctx.userId)) return;

    emitViolation({
      ts: new Date().toISOString(),
      kind: 'bdm_silent_self_fill',
      model: modelName,
      op: 'aggregate',
      path: ctx.requestPath,
      requestId: ctx.requestId,
      userId: ctx.userId,
      role: ctx.userRole || null,
      entityId: ctx.entityId,
      pipelineStages: pipeline.map((stage) =>
        Object.keys(stage || {}).slice(0, 1).join('') || '?'
      ).slice(0, 12),
      stack: buildShortStack(),
    }, mode);
  };

  return (schema) => {
    schema.pre(QUERY_HOOKS, queryHookFn);
    schema.pre('aggregate', aggregateHookFn);
  };
};

const attachBdmGuard = ({ verbose = true, mode: modeOverride } = {}) => {
  const mode = modeOverride || resolveMode();
  const config = require(path.join(__dirname, 'entityScopedModels.json'));

  const bdmScopedSet = new Set(config.strict_entity_and_bdm);

  if (mode === 'off') {
    if (verbose) {
      // eslint-disable-next-line no-console
      console.log('[bdmGuard] disabled via BDM_GUARD_MODE=off');
    }
    return { bdmScopedSet, mode };
  }

  mongoose.plugin(buildPlugin(bdmScopedSet, mode));

  if (verbose) {
    // eslint-disable-next-line no-console
    console.log(
      `[bdmGuard] attached (mode=${mode}), observing ${bdmScopedSet.size} models for ` +
      `Rule #21 silent-self-fill`
    );
  }

  return { bdmScopedSet, mode };
};

module.exports = {
  attachBdmGuard,
  extractBdmIdValue,
  isSelfFill,
  resolveMode,
  VALID_MODES,
};
