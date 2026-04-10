/**
 * Functional Role Assignment Routes — Phase 31
 *
 * Mounted at /api/erp/role-assignments
 *
 * Cross-entity functional deployment of people.
 * Admin/President can create, update, deactivate assignments.
 * Management users can view cross-entity assignments.
 */

const express = require('express');
const router = express.Router();
const { adminOnly } = require('../../middleware/roleCheck');
const {
  listAssignments,
  getAssignment,
  getByPerson,
  createAssignment,
  updateAssignment,
  deactivateAssignment,
  bulkCreate,
} = require('../controllers/functionalRoleController');

// Static routes BEFORE parameterized /:id
router.get('/by-person/:personId', getByPerson);
router.post('/bulk', adminOnly, bulkCreate);

// List + CRUD
router.get('/', listAssignments);
router.post('/', adminOnly, createAssignment);
router.get('/:id', getAssignment);
router.put('/:id', adminOnly, updateAssignment);
router.post('/:id/deactivate', adminOnly, deactivateAssignment);

module.exports = router;
