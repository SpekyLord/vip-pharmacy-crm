/**
 * Entity Guard — Mongoose plugin (observation mode, Day 3 of 5).
 *
 * Detects queries on entity-scoped models that omit an `entity_id` filter.
 * Logs violations as `[ENTITY_GUARD_VIOLATION] {...}` JSON lines so Day 4
 * triage can `pm2 logs | grep ENTITY_GUARD_VIOLATION`.
 *
 *  - DOES NOT THROW. Pure logging.
 *  - Skips when AsyncLocalStorage store is empty (background jobs).
 *  - Skips when `ctx.crossEntityAllowed` is true (route opted-in via
 *    `markCrossEntityAllowed(req)`).
 *
 * Hook coverage:
 *   reads:  find, findOne, count, countDocuments, distinct, estimatedDocumentCount
 *   writes: updateOne, updateMany, replaceOne, deleteOne, deleteMany,
 *           findOneAndUpdate, findOneAndReplace, findOneAndDelete
 *   pipelines: aggregate (separate handler)
 *
 * Filter detection accepts:
 *   { entity_id: ... }           direct
 *   { $and: [..., { entity_id }] } / $or
 *   any nested level via shallow recursion (depth-2)
 *
 * `findById` lowers to `findOne({ _id })` and WILL be flagged. That's
 * intentional — Phase 23 cross-entity leak audit found exactly that pattern.
 */

const mongoose = require('mongoose');
const path = require('path');

const { readLiveCtx } = require('./requestContext');

const QUERY_HOOKS = [
  'find',
  'findOne',
  'count',
  'countDocuments',
  'distinct',
  'estimatedDocumentCount',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'findOneAndDelete',
];

const filterHasEntityId = (filter, depth = 0) => {
  if (!filter || typeof filter !== 'object' || depth > 3) return false;
  if (Object.prototype.hasOwnProperty.call(filter, 'entity_id')) return true;
  for (const key of ['$and', '$or', '$nor']) {
    const arr = filter[key];
    if (Array.isArray(arr)) {
      for (const sub of arr) {
        if (filterHasEntityId(sub, depth + 1)) return true;
      }
    }
  }
  return false;
};

const pipelineHasEntityMatch = (pipeline) => {
  if (!Array.isArray(pipeline)) return false;
  for (const stage of pipeline) {
    if (stage && typeof stage === 'object' && stage.$match) {
      if (filterHasEntityId(stage.$match)) return true;
    }
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

const emitViolation = (payload) => {
  // Single-line JSON for greppability + machine ingest.
  // eslint-disable-next-line no-console
  console.error('[ENTITY_GUARD_VIOLATION]', JSON.stringify(payload));
};

const buildPlugin = (entityScopedSet) => {
  const queryHookFn = function entityQueryHook() {
    const ctx = readLiveCtx();
    if (!ctx) return;
    if (ctx.crossEntityAllowed) return;

    const modelName = this.model && this.model.modelName;
    if (!modelName || !entityScopedSet.has(modelName)) return;

    const filter = typeof this.getFilter === 'function' ? this.getFilter() : (this._conditions || {});
    if (filterHasEntityId(filter)) return;

    emitViolation({
      ts: new Date().toISOString(),
      kind: 'entity_filter_missing',
      model: modelName,
      op: this.op || 'query',
      path: ctx.requestPath,
      requestId: ctx.requestId,
      userId: ctx.userId,
      role: ctx.userRole || null,
      entityId: ctx.entityId,
      isPrivileged: ctx.isPrivileged,
      filterKeys: Object.keys(filter || {}).slice(0, 12),
      stack: buildShortStack(),
    });
  };

  const aggregateHookFn = function entityAggregateHook() {
    const ctx = readLiveCtx();
    if (!ctx) return;
    if (ctx.crossEntityAllowed) return;

    const modelName = this._model && this._model.modelName;
    if (!modelName || !entityScopedSet.has(modelName)) return;

    const pipeline = typeof this.pipeline === 'function' ? this.pipeline() : [];
    if (pipelineHasEntityMatch(pipeline)) return;

    emitViolation({
      ts: new Date().toISOString(),
      kind: 'entity_filter_missing',
      model: modelName,
      op: 'aggregate',
      path: ctx.requestPath,
      requestId: ctx.requestId,
      userId: ctx.userId,
      role: ctx.userRole || null,
      entityId: ctx.entityId,
      isPrivileged: ctx.isPrivileged,
      pipelineStages: pipeline.map((stage) =>
        Object.keys(stage || {}).slice(0, 1).join('') || '?'
      ).slice(0, 12),
      stack: buildShortStack(),
    });
  };

  return (schema) => {
    schema.pre(QUERY_HOOKS, queryHookFn);
    schema.pre('aggregate', aggregateHookFn);
  };
};

const attachEntityGuard = ({ verbose = true } = {}) => {
  const config = require(path.join(__dirname, 'entityScopedModels.json'));

  const entityScopedSet = new Set([
    ...config.strict_entity,
    ...config.strict_entity_and_bdm,
  ]);

  mongoose.plugin(buildPlugin(entityScopedSet));

  if (verbose) {
    // eslint-disable-next-line no-console
    console.log(
      `[entityGuard] attached, observing ${entityScopedSet.size} models ` +
      `(strict_entity=${config.strict_entity.length}, ` +
      `strict_entity_and_bdm=${config.strict_entity_and_bdm.length})`
    );
  }

  return { entityScopedSet, config };
};

module.exports = {
  attachEntityGuard,
  filterHasEntityId,
  pipelineHasEntityMatch,
};
