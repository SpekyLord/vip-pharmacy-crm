const express = require('express');
const router = express.Router();

const {
  getAllSpecializations,
  createSpecialization,
  updateSpecialization,
  deleteSpecialization,
  seedFromExisting,
} = require('../controllers/specializationController');

const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');

// All routes require authentication
router.use(protect);

// All authenticated users can read
router.get('/', getAllSpecializations);

// Admin only
router.post('/', adminOnly, createSpecialization);
router.post('/seed', adminOnly, seedFromExisting);
router.put('/:id', adminOnly, updateSpecialization);
router.delete('/:id', adminOnly, deleteSpecialization);

module.exports = router;
