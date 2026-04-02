const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth');
const { roleCheck } = require('../../middleware/roleCheck');
const c = require('../controllers/hospitalController');

router.get('/', protect, c.getAll);
router.get('/:id', protect, c.getById);
router.post('/', protect, roleCheck('admin', 'finance'), c.create);
router.put('/:id', protect, roleCheck('admin', 'finance'), c.update);
router.patch('/:id/deactivate', protect, roleCheck('admin', 'finance'), c.deactivate);

module.exports = router;
