const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const {
  getPeopleList,
  getPersonById,
  createPerson,
  updatePerson,
  deactivatePerson,
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
} = require('../controllers/peopleController');

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
router.post('/:id/disable-login', roleCheck('admin', 'president'), disableLogin);
router.post('/:id/enable-login', roleCheck('admin', 'president'), enableLogin);
router.post('/:id/unlink-login', roleCheck('admin', 'president'), unlinkLogin);
router.post('/:id/change-role', roleCheck('admin', 'president'), changeSystemRole);
router.delete('/:id', roleCheck('admin', 'finance', 'president'), deactivatePerson);

// ═══ Compensation Profiles ═══
router.get('/:id/comp', getCompProfile);
router.post('/:id/comp', roleCheck('admin', 'finance', 'president'), createCompProfile);
router.put('/:id/comp/:profileId', roleCheck('admin', 'finance', 'president'), updateCompProfile);

module.exports = router;
