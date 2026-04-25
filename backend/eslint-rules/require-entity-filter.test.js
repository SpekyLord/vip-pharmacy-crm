/**
 * Unit tests for the require-entity-filter ESLint rule.
 *
 * ESLint v9 lives in frontend/node_modules; we extend Node's resolve lookup
 * to find it. If it's still missing, the suite skips with a clear reason so
 * the rest of the backend Jest run stays green.
 */

const path = require('path');

const FRONTEND_ESLINT = path.join(__dirname, '..', '..', 'frontend', 'node_modules', 'eslint');
let eslintMod = null;
let eslintLoadError = null;
try {
  eslintMod = require(FRONTEND_ESLINT);
} catch (e) {
  eslintLoadError = e;
}

const rule = require('./require-entity-filter');

const TEST_OPTS = [{
  models: ['Sale', 'Expense', 'JournalEntry'],
}];

if (!eslintMod) {
  describe('require-entity-filter (RuleTester)', () => {
    it.skip(`skipped: eslint module not loadable (${eslintLoadError && eslintLoadError.code})`, () => {});
  });
} else {
  const { RuleTester } = eslintMod;
  const ruleTester = new RuleTester({
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
    },
  });

  ruleTester.run('require-entity-filter', rule, {
    valid: [
      {
        name: 'find with entity_id literal',
        code: `Sale.find({ entity_id: req.entityId, status: 'POSTED' })`,
        options: TEST_OPTS,
      },
      {
        name: 'find with string-key entity_id',
        code: `Sale.find({ 'entity_id': req.entityId })`,
        options: TEST_OPTS,
      },
      {
        name: 'find with $and branch carrying entity_id',
        code: `Sale.find({ $and: [{ status: 'POSTED' }, { entity_id: req.entityId }] })`,
        options: TEST_OPTS,
      },
      {
        name: 'find with nested $or > $and entity_id',
        code: `Sale.find({ $or: [{ $and: [{ entity_id: x }] }, { foo: 1 }] })`,
        options: TEST_OPTS,
      },
      {
        name: 'find with spread tenantFilter',
        code: `Sale.find({ ...req.tenantFilter, status: 'POSTED' })`,
        options: TEST_OPTS,
      },
      {
        name: 'find with spread entityScope',
        code: `Sale.find({ ...entityScope, status: 'POSTED' })`,
        options: TEST_OPTS,
      },
      {
        name: 'find with spread buildTenantQuery() call',
        code: `Sale.find({ ...buildTenantQuery(req), status: 'POSTED' })`,
        options: TEST_OPTS,
      },
      {
        name: 'aggregate with $match entity_id in pipeline',
        code: `Sale.aggregate([{ $match: { entity_id: req.entityId } }, { $group: { _id: '$bdm_id' } }])`,
        options: TEST_OPTS,
      },
      {
        name: 'aggregate with dynamic pipeline variable (cannot statically inspect)',
        code: `Sale.aggregate(pipeline)`,
        options: TEST_OPTS,
      },
      {
        name: 'unknown model — skipped',
        code: `RandomModel.find({})`,
        options: TEST_OPTS,
      },
      {
        name: 'global model — skipped',
        code: `Customer.find({})`,
        options: TEST_OPTS,
      },
      {
        name: 'method not in hook list — skipped',
        code: `Sale.bulkWrite([])`,
        options: TEST_OPTS,
      },
      {
        name: 'updateOne with entity_id in filter',
        code: `Sale.updateOne({ _id: id, entity_id: req.entityId }, { $set: { status: 'CANCELLED' } })`,
        options: TEST_OPTS,
      },
      {
        name: 'findOneAndUpdate with entity_id',
        code: `JournalEntry.findOneAndUpdate({ entity_id: e, _id: id }, { $set: { x: 1 } })`,
        options: TEST_OPTS,
      },
    ],

    invalid: [
      {
        name: 'find with no entity_id',
        code: `Sale.find({ status: 'POSTED' })`,
        options: TEST_OPTS,
        errors: [{ messageId: 'missingEntityFilter' }],
      },
      {
        name: 'find with no arguments at all',
        code: `Sale.find()`,
        options: TEST_OPTS,
        errors: [{ messageId: 'missingEntityFilter' }],
      },
      {
        name: 'findOne empty filter',
        code: `Sale.findOne({})`,
        options: TEST_OPTS,
        errors: [{ messageId: 'missingEntityFilter' }],
      },
      {
        name: 'findById always flagged (collapses to findOne {_id})',
        code: `Sale.findById(req.params.id)`,
        options: TEST_OPTS,
        errors: [{ messageId: 'missingEntityFilter' }],
      },
      {
        name: 'findByIdAndUpdate always flagged',
        code: `Expense.findByIdAndUpdate(id, { $set: { x: 1 } })`,
        options: TEST_OPTS,
        errors: [{ messageId: 'missingEntityFilter' }],
      },
      {
        name: 'aggregate with no $match entity_id',
        code: `Sale.aggregate([{ $match: { status: 'POSTED' } }, { $group: { _id: '$bdm_id' } }])`,
        options: TEST_OPTS,
        errors: [{ messageId: 'missingEntityFilter' }],
      },
      {
        name: 'aggregate with no arguments',
        code: `Sale.aggregate()`,
        options: TEST_OPTS,
        errors: [{ messageId: 'missingEntityFilter' }],
      },
      {
        name: 'updateMany no entity_id',
        code: `Expense.updateMany({ status: 'PENDING' }, { $set: { foo: 1 } })`,
        options: TEST_OPTS,
        errors: [{ messageId: 'missingEntityFilter' }],
      },
      {
        name: 'spread of unrelated variable',
        code: `Sale.find({ ...someBag, status: 'POSTED' })`,
        options: TEST_OPTS,
        errors: [{ messageId: 'missingEntityFilter' }],
      },
    ],
  });

  // Identifier filters cannot be statically inspected — runtime guard catches
  // them instead. Asserted in its own block to keep the intent explicit.
  describe('identifier filters are passthrough (runtime guard handles)', () => {
    it('does not flag Sale.find(localVar)', () => {
      const linter = new eslintMod.Linter();
      const messages = linter.verify(
        `const f = { status: 'POSTED' }; Sale.find(f);`,
        {
          languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs' },
          plugins: { 'vip-tenant': { rules: { 'require-entity-filter': rule } } },
          rules: { 'vip-tenant/require-entity-filter': ['error', TEST_OPTS[0]] },
        },
      );
      expect(messages.length).toBe(0);
    });
  });
}

describe('require-entity-filter (default model load)', () => {
  it('rule.create exposed and accepts default options', () => {
    const fakeContext = { options: [], report: () => {}, getFilename: () => 'x.js' };
    expect(typeof rule.create(fakeContext)).toBe('object');
  });
});
