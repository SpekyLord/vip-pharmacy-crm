/**
 * KPI Self-Rating Routes — Phase 32
 *
 * Mounted at /api/erp/self-ratings under erpAccessCheck('people').
 *
 * Self-rating workflow: DRAFT → SUBMITTED → REVIEWED → APPROVED
 * Manager can also return: SUBMITTED/REVIEWED → RETURNED → (re-edit) → SUBMITTED
 */

const express = require('express');
const router = express.Router();
const { adminOnly } = require('../../middleware/roleCheck');
const {
  getMyRatings,
  getMyCurrentDraft,
  getRatingById,
  getRatingsForReview,
  getRatingsByPerson,
  saveDraft,
  submitRating,
  reviewRating,
  approveRating,
  returnRating,
} = require('../controllers/kpiSelfRatingController');

// ─── Static routes BEFORE parameterized /:id ───
router.get('/my', getMyRatings);
router.get('/my/current', getMyCurrentDraft);
router.get('/review', getRatingsForReview);
router.get('/by-person/:personId', adminOnly, getRatingsByPerson);

// ─── CRUD + workflow ───
router.post('/', saveDraft);
router.post('/:id/submit', submitRating);
router.put('/:id/review', reviewRating);
router.post('/:id/approve', adminOnly, approveRating);
router.post('/:id/return', returnRating);
router.get('/:id', getRatingById);

module.exports = router;
