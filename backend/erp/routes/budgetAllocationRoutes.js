const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth');
const { roleCheck } = require('../../middleware/roleCheck');
const c = require('../controllers/budgetAllocationController');

router.get('/', protect, c.getAll);
router.get('/:id', protect, c.getById);
router.post('/', protect, roleCheck('admin', 'finance'), c.create);
router.put('/:id', protect, roleCheck('admin', 'finance'), c.update);
router.post('/:id/approve', protect, roleCheck('admin', 'finance'), c.approve);

module.exports = router;
