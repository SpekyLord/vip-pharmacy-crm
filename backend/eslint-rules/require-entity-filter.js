/**
 * ESLint rule: require-entity-filter
 *
 * Static counterpart to the runtime entityGuard middleware. Flags Mongoose
 * query calls on entity-scoped models that omit an `entity_id` filter in
 * the first argument.
 *
 * Source of truth for which models are entity-scoped:
 *   backend/middleware/entityScopedModels.json
 *     -> union of `strict_entity` + `strict_entity_and_bdm` (matches the
 *        runtime guard exactly).
 *
 * Detection scope (matches entityGuard's QUERY_HOOKS):
 *   find, findOne, findById*, findByIdAndUpdate*, findByIdAndDelete*,
 *   count, countDocuments, distinct, estimatedDocumentCount,
 *   updateOne, updateMany, replaceOne, deleteOne, deleteMany,
 *   findOneAndUpdate, findOneAndReplace, findOneAndDelete, aggregate
 *
 *   *findById* lowers to findOne({_id}) in mongoose; flagged the same way
 *    the runtime guard would flag the resulting findOne.
 *
 * Acceptance heuristics for "this query has an entity_id filter":
 *   - Object literal contains `entity_id` (literal or string key) at any
 *     depth, including under $and/$or/$nor branches (depth-3 cap).
 *   - Object literal contains a SpreadElement whose source identifier name
 *     looks tenant-scoped: matches /Filter$|Scope$|Tenant/i. Catches the
 *     standard pattern `{ ...req.tenantFilter, _id: x }` and
 *     `{ ...entityScope, status }`.
 *   - For aggregate(): look for a $match stage in the pipeline array that
 *     satisfies the same checks (depth-3).
 *
 * False-positives the rule cannot statically prove safe:
 *   - `.where('entity_id').equals(x)` chained calls (entity filter set
 *     after the find() call).
 *   - Filters built up across statements: `const f = {}; f.entity_id = x;
 *     Model.find(f);` — the rule only inspects the first arg in place.
 *   - Cross-entity-allowed routes (runtime opts in via
 *     markCrossEntityAllowed; static analysis can't see request flow).
 *
 * The escape hatch for all three is a per-line disable WITH A REASON:
 *
 *     // eslint-disable-next-line vip-tenant/require-entity-filter -- chained .where('entity_id')
 *     const sales = await Sale.find();
 *
 * Discipline: the reason after `--` is the audit trail. Reviewers should
 * push back on bare disables with no reason.
 */

const path = require('path');
const fs = require('fs');

const DEFAULT_QUERY_METHODS = [
  'find',
  'findOne',
  'findById',
  'findByIdAndUpdate',
  'findByIdAndDelete',
  'findByIdAndRemove',
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
  'findOneAndRemove',
  'aggregate',
];

const SPREAD_RX = /Filter$|Scope$|Tenant/i;

const loadDefaultModels = () => {
  try {
    const jsonPath = path.join(__dirname, '..', 'middleware', 'entityScopedModels.json');
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    return [...(raw.strict_entity || []), ...(raw.strict_entity_and_bdm || [])];
  } catch (_e) {
    return [];
  }
};

const propertyKeyName = (prop) => {
  if (!prop || prop.type !== 'Property') return null;
  if (prop.computed) return null;
  if (prop.key.type === 'Identifier') return prop.key.name;
  if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') return prop.key.value;
  return null;
};

const spreadIdentifierName = (spread) => {
  if (!spread || spread.type !== 'SpreadElement') return null;
  const arg = spread.argument;
  if (!arg) return null;
  if (arg.type === 'Identifier') return arg.name;
  if (arg.type === 'MemberExpression') {
    if (arg.property && arg.property.type === 'Identifier') return arg.property.name;
  }
  if (arg.type === 'CallExpression' && arg.callee) {
    if (arg.callee.type === 'Identifier') return arg.callee.name;
    if (arg.callee.type === 'MemberExpression' && arg.callee.property?.type === 'Identifier') {
      return arg.callee.property.name;
    }
  }
  return null;
};

const objectHasEntityFilter = (objExpr, depth = 0) => {
  if (!objExpr || objExpr.type !== 'ObjectExpression' || depth > 3) return false;

  for (const prop of objExpr.properties) {
    if (prop.type === 'Property') {
      const name = propertyKeyName(prop);
      if (name === 'entity_id') return true;
      if (name === '$and' || name === '$or' || name === '$nor') {
        const v = prop.value;
        if (v && v.type === 'ArrayExpression') {
          for (const el of v.elements) {
            if (el && el.type === 'ObjectExpression' && objectHasEntityFilter(el, depth + 1)) {
              return true;
            }
          }
        }
      }
    } else if (prop.type === 'SpreadElement') {
      const name = spreadIdentifierName(prop);
      if (name && SPREAD_RX.test(name)) return true;
    }
  }
  return false;
};

const arrayHasEntityMatch = (arrExpr) => {
  if (!arrExpr || arrExpr.type !== 'ArrayExpression') return false;
  for (const stage of arrExpr.elements) {
    if (!stage || stage.type !== 'ObjectExpression') continue;
    for (const prop of stage.properties) {
      if (prop.type !== 'Property' || propertyKeyName(prop) !== '$match') continue;
      if (prop.value && prop.value.type === 'ObjectExpression' && objectHasEntityFilter(prop.value)) {
        return true;
      }
    }
  }
  return false;
};

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require an entity_id filter on Mongoose queries against entity-scoped models. ' +
        'Mirrors the runtime entityGuard middleware.',
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          models: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Model names that require entity_id filtering. Defaults to the union of ' +
              'strict_entity + strict_entity_and_bdm from entityScopedModels.json.',
          },
          methods: {
            type: 'array',
            items: { type: 'string' },
            description: 'Mongoose query methods to inspect. Defaults to the runtime guard hook list.',
          },
        },
      },
    ],
    messages: {
      missingEntityFilter:
        '{{model}}.{{method}}() must include an entity_id filter, or add ' +
        '`// eslint-disable-next-line vip-tenant/require-entity-filter -- <reason>` if the call is intentionally cross-entity.',
    },
  },

  create(context) {
    const opts = context.options[0] || {};
    const modelSet = new Set(opts.models && opts.models.length ? opts.models : loadDefaultModels());
    const methodSet = new Set(opts.methods && opts.methods.length ? opts.methods : DEFAULT_QUERY_METHODS);

    if (modelSet.size === 0) return {};

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (!callee || callee.type !== 'MemberExpression') return;
        if (callee.property?.type !== 'Identifier') return;

        const method = callee.property.name;
        if (!methodSet.has(method)) return;

        const obj = callee.object;
        if (!obj || obj.type !== 'Identifier') return;
        const modelName = obj.name;
        if (!modelSet.has(modelName)) return;

        const firstArg = node.arguments[0];

        if (method === 'findById' || method === 'findByIdAndUpdate' ||
            method === 'findByIdAndDelete' || method === 'findByIdAndRemove') {
          context.report({
            node,
            messageId: 'missingEntityFilter',
            data: { model: modelName, method },
          });
          return;
        }

        if (method === 'aggregate') {
          if (firstArg && firstArg.type === 'ArrayExpression' && arrayHasEntityMatch(firstArg)) return;
          if (firstArg && firstArg.type === 'Identifier') return;
          context.report({
            node,
            messageId: 'missingEntityFilter',
            data: { model: modelName, method },
          });
          return;
        }

        if (!firstArg) {
          context.report({
            node,
            messageId: 'missingEntityFilter',
            data: { model: modelName, method },
          });
          return;
        }

        if (firstArg.type === 'ObjectExpression') {
          if (!objectHasEntityFilter(firstArg)) {
            context.report({
              node,
              messageId: 'missingEntityFilter',
              data: { model: modelName, method },
            });
          }
          return;
        }
      },
    };
  },
};
