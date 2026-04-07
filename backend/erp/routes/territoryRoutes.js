const express = require('express');
const { roleCheck } = require('../../middleware/roleCheck');
const { getAll, getById, create, update, remove, getForBdm } = require('../controllers/territoryController');

const router = express.Router();

router.get('/', getAll);
router.get('/my-code', getForBdm);
router.get('/:id', getById);
router.post('/', roleCheck('admin', 'finance', 'president'), create);
router.put('/:id', roleCheck('admin', 'finance', 'president'), update);
router.delete('/:id', roleCheck('admin', 'finance', 'president'), remove);

module.exports = router;
