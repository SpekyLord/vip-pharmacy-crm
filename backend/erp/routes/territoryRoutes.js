const express = require('express');
const { roleCheck } = require('../../middleware/roleCheck');
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const { getAll, getById, create, update, remove, getForBdm } = require('../controllers/territoryController');

const router = express.Router();

router.get('/', getAll);
router.get('/my-code', getForBdm);
router.get('/:id', getById);
router.post('/', roleCheck('admin', 'finance', 'president'), create);
router.put('/:id', roleCheck('admin', 'finance', 'president'), update);
// Phase 3c — Tier 2 lookup-only. Territory delete orphans BDM/customer assignments.
router.delete('/:id', erpSubAccessCheck('master', 'territory_delete'), remove);

module.exports = router;
