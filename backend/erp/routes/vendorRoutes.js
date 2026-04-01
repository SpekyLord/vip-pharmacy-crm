const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth');
const { roleCheck } = require('../../middleware/roleCheck');
const c = require('../controllers/vendorController');

router.get('/', protect, c.getAll);
router.get('/search', protect, c.search);
router.get('/:id', protect, c.getById);
router.post('/', protect, roleCheck('admin', 'finance'), c.create);
router.put('/:id', protect, roleCheck('admin', 'finance'), c.update);
router.post('/:id/add-alias', protect, roleCheck('admin', 'finance'), c.addAlias);
router.patch('/:id/deactivate', protect, roleCheck('admin', 'finance'), c.deactivate);

module.exports = router;
