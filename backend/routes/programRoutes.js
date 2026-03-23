const express = require('express');
const router = express.Router();

const {
  getAllPrograms,
  createProgram,
  updateProgram,
  deleteProgram,
  seedFromExisting,
  getProgramStats,
} = require('../controllers/programController');

const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');

// All routes require authentication
router.use(protect);

// All authenticated users can read (for dropdowns)
router.get('/', getAllPrograms);

// Stats (admin only)
router.get('/stats', adminOnly, getProgramStats);

// Admin only
router.post('/', adminOnly, createProgram);
router.post('/seed', adminOnly, seedFromExisting);
router.put('/:id', adminOnly, updateProgram);
router.delete('/:id', adminOnly, deleteProgram);

module.exports = router;
