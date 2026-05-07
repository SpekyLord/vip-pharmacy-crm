/**
 * Unit smoke for assertResourceReadAccess (Phase 15.3-fix May 07 2026).
 *
 * Exercises the access matrix with stub `req` and `resource` objects:
 *   - president       → cross-entity allowed
 *   - admin (entity in entity_ids)  → allowed
 *   - admin (entity NOT in entity_ids) → 403
 *   - finance (single entity match)    → allowed
 *   - finance (single entity mismatch) → 403
 *   - staff (owner)                    → allowed
 *   - staff (entity match, not owner, no proxy) → 403
 *   - staff (entity mismatch)                   → 403
 *
 * No DB / network / Mongoose required. Stubs the lookup roles to avoid the
 * `await Lookup.findOne(...)` call by short-circuiting non-staff paths and
 * monkey-patching getProxyRolesForModule to return [].
 */

const path = require('path');
const Module = require('module');

// Stub Mongoose-loaded models BEFORE requiring the helper to avoid mongoose init.
const ROOT = path.resolve(__dirname, '..');

// Pre-stub the Lookup model so getProxyRolesForModule's findOne returns null.
// We do this by wrapping require() to intercept the Lookup model path.
const origResolve = Module._resolveFilename;
const stubs = new Map();

function stub(absPath, exports) { stubs.set(absPath, exports); }

stub(path.resolve(ROOT, 'erp/models/Lookup.js'), {
  findOne: () => ({ lean: async () => null }),
});

const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  const resolved = (() => {
    try { return Module._resolveFilename(id, this); } catch { return id; }
  })();
  if (stubs.has(resolved)) return stubs.get(resolved);
  return origRequire.apply(this, arguments);
};

const { assertResourceReadAccess } = require(path.resolve(ROOT, 'erp/utils/resolveOwnerScope.js'));

const ENT_VIP = '69cd76ec7f6beb5888bd1a53';
const ENT_MGCO = '69cd76ec7f6beb5888bd1a56';
const STAFF_ID = '69b3944f0aee4ab455785c50';
const OTHER_ID = '69b3944f0aee4ab455785c51';

function mkReq(role, entityId, entityIds = []) {
  return {
    user: {
      _id: STAFF_ID,
      role,
      entity_id: entityId,
      entity_ids: entityIds,
      erp_access: { sub_permissions: { sales: { proxy_entry: false } } },
    },
    isPresident: role === 'president' || role === 'ceo',
    isAdmin: role === 'admin',
    isFinance: role === 'finance',
    entityId,
    tenantFilter: role === 'president' || role === 'ceo' ? {} : { entity_id: entityId },
  };
}

function mkSale(entityId, bdmId = STAFF_ID) {
  return { _id: 'salepretendid', entity_id: entityId, bdm_id: bdmId };
}

let pass = 0, fail = 0;

async function check(label, fn) {
  try {
    await fn();
    pass++;
    console.log(`PASS  ${label}`);
  } catch (err) {
    fail++;
    console.log(`FAIL  ${label}  →  ${err.message}`);
  }
}

async function expectAllow(label, req, sale) {
  await check(label, async () => {
    await assertResourceReadAccess(req, sale, { moduleKey: 'sales', subKey: 'proxy_entry', resourceLabel: 'sale' });
  });
}

async function expectDeny(label, req, sale, expectedStatus = 403) {
  await check(label, async () => {
    let thrown = null;
    try {
      await assertResourceReadAccess(req, sale, { moduleKey: 'sales', subKey: 'proxy_entry', resourceLabel: 'sale' });
    } catch (err) { thrown = err; }
    if (!thrown) throw new Error('expected access to be DENIED but it was ALLOWED');
    if (thrown.statusCode !== expectedStatus) {
      throw new Error(`expected statusCode ${expectedStatus} but got ${thrown.statusCode}`);
    }
  });
}

(async () => {
  console.log('\nUnit smoke — assertResourceReadAccess');
  console.log('─'.repeat(72));

  // President / CEO — always allowed regardless of entity.
  await expectAllow(
    'president on VIP can view MG-and-CO sale',
    mkReq('president', ENT_VIP),
    mkSale(ENT_MGCO)
  );
  await expectAllow(
    'ceo on VIP can view MG-and-CO sale',
    mkReq('ceo', ENT_VIP),
    mkSale(ENT_MGCO)
  );

  // Admin — must have the resource entity in their allowlist.
  await expectAllow(
    'admin with [VIP, MG-and-CO] in entity_ids can view MG-and-CO sale (the user-reported bug)',
    mkReq('admin', ENT_VIP, [ENT_VIP, ENT_MGCO]),
    mkSale(ENT_MGCO)
  );
  await expectDeny(
    'admin with only [VIP] in entity_ids gets 403 on MG-and-CO sale (no silent fallback)',
    mkReq('admin', ENT_VIP, [ENT_VIP]),
    mkSale(ENT_MGCO)
  );

  // Finance — same rule as admin.
  await expectAllow(
    'finance whose entity_id matches the sale\'s entity is allowed',
    mkReq('finance', ENT_MGCO),
    mkSale(ENT_MGCO)
  );
  await expectDeny(
    'finance whose entity_id does NOT match gets 403',
    mkReq('finance', ENT_VIP),
    mkSale(ENT_MGCO)
  );

  // Staff — entity match required AND (own OR proxy).
  await expectAllow(
    'staff (BDM) viewing their own sale in their entity',
    mkReq('staff', ENT_VIP),
    mkSale(ENT_VIP, STAFF_ID)
  );
  await expectDeny(
    'staff viewing a peer\'s sale in their entity (no proxy) gets 403',
    mkReq('staff', ENT_VIP),
    mkSale(ENT_VIP, OTHER_ID)
  );
  await expectDeny(
    'staff viewing any sale in a different entity gets 403',
    mkReq('staff', ENT_VIP),
    mkSale(ENT_MGCO, STAFF_ID)
  );

  // Edge: missing resource throws 500-class error.
  await check('missing resource throws 500-class', async () => {
    let thrown = null;
    try {
      await assertResourceReadAccess(mkReq('admin', ENT_VIP, [ENT_VIP]), null);
    } catch (err) { thrown = err; }
    if (!thrown) throw new Error('expected throw');
    if (thrown.statusCode !== 500) throw new Error(`expected 500 got ${thrown.statusCode}`);
  });

  console.log('─'.repeat(72));
  console.log(`${pass}/${pass + fail} passed${fail ? `, ${fail} FAILED` : ''}`);
  process.exit(fail ? 1 : 0);
})();
