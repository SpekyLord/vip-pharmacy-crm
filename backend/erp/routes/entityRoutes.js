const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const entityController = require('../controllers/entityController');

const presidentAdmin = roleCheck('president', 'admin');

router.get('/', roleCheck('admin', 'finance', 'president'), entityController.getAll);
router.get('/:id', roleCheck('admin', 'finance', 'president'), entityController.getById);
router.post('/', roleCheck('president'), entityController.create);
router.put('/:id', presidentAdmin, entityController.update);

module.exports = router;
