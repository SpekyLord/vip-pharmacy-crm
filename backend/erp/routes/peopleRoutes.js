const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const {
  getPeopleList,
  getPersonById,
  createPerson,
  updatePerson,
  deactivatePerson,
  separatePerson,
  reactivatePerson,
  getCompProfile,
  createCompProfile,
  updateCompProfile,
  getAsUsers,
  syncFromCrm,
  getOrgChart,
  createPersonUnified,
  createLoginForPerson,
  disableLogin,
  enableLogin,
  unlinkLogin,
  changeSystemRole,
  bulkChangeSystemRole,
  getLegacyRoleCounts,
  transferEntity,
  grantEntity,
  revokeEntity,
} = require('../controllers/peopleController');

// ═══ Bulk Role Migration (admin-only) ═══
// Phase 3c — bulk-change-role mutates system-tier role for many users at once. Danger-baseline.
router.get('/legacy-role-counts', roleCheck('admin', 'president'), getLegacyRoleCounts);
router.post('/bulk-change-role', erpSubAccessCheck('people', 'manage_login'), bulkChangeSystemRole);

// ═══ People CRUD ═══
router.get('/as-users', getAsUsers);  // lightweight CRM-compatible user list (entity-scoped)
router.post('/sync-from-crm', roleCheck('admin', 'president'), syncFromCrm);  // import CRM Users → PeopleMaster
router.post('/create-with-login', roleCheck('admin', 'president'), createPersonUnified);  // unified: CRM User + PeopleMaster
router.get('/org-chart', getOrgChart);
router.get('/', getPeopleList);
router.post('/', roleCheck('admin', 'finance', 'president'), createPerson);
router.get('/:id', getPersonById);
router.put('/:id', roleCheck('admin', 'finance', 'president'), updatePerson);
router.post('/:id/create-login', roleCheck('admin', 'president'), createLoginForPerson);
// Phase 3c — login manipulation routes (disable/unlink/change-role) gated as `people.manage_login`
// (danger-baseline). Enable-login is the recoverable inverse → keep role-gated.
router.post('/:id/disable-login', erpSubAccessCheck('people', 'manage_login'), disableLogin);
router.post('/:id/enable-login', roleCheck('admin', 'president'), enableLogin);
router.post('/:id/unlink-login', erpSubAccessCheck('people', 'manage_login'), unlinkLogin);
router.post('/:id/change-role', erpSubAccessCheck('people', 'manage_login'), changeSystemRole);
// Phase 3c — separate/deactivate cascade login disable + flip employment status. Danger-baseline.
router.post('/:id/separate', erpSubAccessCheck('people', 'terminate'), separatePerson);
router.post('/:id/reactivate', roleCheck('admin', 'president'), reactivatePerson);
router.delete('/:id', erpSubAccessCheck('people', 'terminate'), deactivatePerson);

// Phase G7 — entity lifecycle (transfer home, grant/revoke additional span). Danger-baseline.
// Sub-perms (people.transfer_entity, people.grant_entity) are baseline-tagged in
// dangerSubPermissions.js so they require explicit grant via Access Template
// even for module-FULL users — staff can be enabled per-template by admin.
router.post('/:id/transfer-entity', erpSubAccessCheck('people', 'transfer_entity'), transferEntity);
router.post('/:id/grant-entity', erpSubAccessCheck('people', 'grant_entity'), grantEntity);
router.post('/:id/revoke-entity', erpSubAccessCheck('people', 'grant_entity'), revokeEntity);

// ═══ Compensation Profiles ═══
router.get('/:id/comp', getCompProfile);
router.post('/:id/comp', roleCheck('admin', 'finance', 'president'), createCompProfile);
router.put('/:id/comp/:profileId', roleCheck('admin', 'finance', 'president'), updateCompProfile);

module.exports = router;
