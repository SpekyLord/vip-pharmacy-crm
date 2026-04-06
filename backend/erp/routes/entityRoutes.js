const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const entityController = require('../controllers/entityController');

const presidentAdmin = roleCheck('president', 'admin');

router.get('/', entityController.getAll);
router.get('/:id', entityController.getById);
router.post('/', roleCheck('president'), entityController.create);
router.put('/:id', presidentAdmin, entityController.update);

module.exports = router;
