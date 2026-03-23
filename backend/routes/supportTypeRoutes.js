const express = require('express');
const router = express.Router();

const {
  getAllSupportTypes,
  createSupportType,
  updateSupportType,
  deleteSupportType,
  seedFromExisting,
  getSupportTypeStats,
} = require('../controllers/supportTypeController');

const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');

// All routes require authentication
router.use(protect);

// All authenticated users can read (for dropdowns)
router.get('/', getAllSupportTypes);

// Stats (admin only)
router.get('/stats', adminOnly, getSupportTypeStats);

// Admin only
router.post('/', adminOnly, createSupportType);
router.post('/seed', adminOnly, seedFromExisting);
router.put('/:id', adminOnly, updateSupportType);
router.delete('/:id', adminOnly, deleteSupportType);

module.exports = router;
