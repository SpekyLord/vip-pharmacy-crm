/**
 * Functional Role Assignment Controller — Phase 31
 *
 * CRUD for cross-entity functional role assignments.
 * Admin/President maintains these via Control Center → People & Access → Role Assignments.
 */

const FunctionalRoleAssignment = require('../models/FunctionalRoleAssignment');
const PeopleMaster = require('../models/PeopleMaster');
const { catchAsync } = require('../../middleware/errorHandler');

const POPULATE_FIELDS = [
  { path: 'person_id', select: 'full_name position department person_type is_active' },
  { path: 'entity_id', select: 'entity_name short_name' },
  { path: 'home_entity_id', select: 'entity_name short_name' },
  { path: 'created_by', select: 'name' },
];

// ═══ List assignments (entity-scoped) ═══

const listAssignments = catchAsync(async (req, res) => {
  const filter = { entity_id: req.entityId };
  if (req.query.person_id) filter.person_id = req.query.person_id;
  if (req.query.functional_role) filter.functional_role = req.query.functional_role.toUpperCase();
  if (req.query.is_active != null) filter.is_active = req.query.is_active === 'true';
  if (req.query.status) filter.status = req.query.status;

  const assignments = await FunctionalRoleAssignment.find(filter)
    .populate(POPULATE_FIELDS)
    .sort({ functional_role: 1, createdAt: -1 })
    .lean();

  res.json({ success: true, data: assignments });
});

// ═══ Get single assignment ═══

const getAssignment = catchAsync(async (req, res) => {
  const assignment = await FunctionalRoleAssignment.findOne({
    _id: req.params.id,
    entity_id: req.entityId,
  })
    .populate(POPULATE_FIELDS)
    .lean();

  if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
  res.json({ success: true, data: assignment });
});

// ═══ Get all assignments for a person (cross-entity) ═══

const getByPerson = catchAsync(async (req, res) => {
  const filter = { person_id: req.params.personId };
  if (req.query.is_active != null) filter.is_active = req.query.is_active === 'true';

  const assignments = await FunctionalRoleAssignment.find(filter)
    .populate(POPULATE_FIELDS)
    .sort({ is_active: -1, functional_role: 1 })
    .lean();

  res.json({ success: true, data: assignments });
});

// ═══ Create assignment ═══

const createAssignment = catchAsync(async (req, res) => {
  const { person_id, entity_id, functional_role, valid_from, valid_to, approval_limit, description } = req.body;

  // Look up person to get home_entity_id
  const person = await PeopleMaster.findById(person_id).select('entity_id full_name').lean();
  if (!person) return res.status(404).json({ success: false, message: 'Person not found' });

  // Check for duplicate active assignment
  const existing = await FunctionalRoleAssignment.findOne({
    person_id,
    entity_id: entity_id || req.entityId,
    functional_role: functional_role.toUpperCase(),
    is_active: true,
    status: 'ACTIVE',
  });
  if (existing) {
    return res.status(409).json({
      success: false,
      message: `${person.full_name} already has an active ${functional_role} assignment at this entity`,
    });
  }

  const assignment = await FunctionalRoleAssignment.create({
    entity_id: entity_id || req.entityId,
    person_id,
    home_entity_id: person.entity_id,
    functional_role: functional_role.toUpperCase(),
    valid_from,
    valid_to: valid_to || null,
    approval_limit: approval_limit || null,
    description: description || '',
    created_by: req.user._id,
  });

  const populated = await FunctionalRoleAssignment.findById(assignment._id)
    .populate(POPULATE_FIELDS)
    .lean();

  res.status(201).json({ success: true, data: populated });
});

// ═══ Update assignment ═══

const updateAssignment = catchAsync(async (req, res) => {
  const allowed = ['valid_from', 'valid_to', 'approval_limit', 'description', 'status', 'is_active', 'functional_role'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  updates.updated_by = req.user._id;

  const assignment = await FunctionalRoleAssignment.findOneAndUpdate(
    { _id: req.params.id, entity_id: req.entityId },
    { $set: updates },
    { new: true, runValidators: true }
  ).populate(POPULATE_FIELDS).lean();

  if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
  res.json({ success: true, data: assignment });
});

// ═══ Deactivate (soft-delete) ═══

const deactivateAssignment = catchAsync(async (req, res) => {
  const assignment = await FunctionalRoleAssignment.findOneAndUpdate(
    { _id: req.params.id, entity_id: req.entityId },
    { $set: { is_active: false, status: 'REVOKED', updated_by: req.user._id } },
    { new: true }
  ).populate(POPULATE_FIELDS).lean();

  if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
  res.json({ success: true, data: assignment, message: 'Assignment revoked' });
});

// ═══ Bulk create (one person → multiple entities) ═══

const bulkCreate = catchAsync(async (req, res) => {
  const { person_id, entity_ids, functional_role, valid_from, valid_to, approval_limit, description } = req.body;

  if (!Array.isArray(entity_ids) || entity_ids.length === 0) {
    return res.status(400).json({ success: false, message: 'entity_ids array is required' });
  }

  const person = await PeopleMaster.findById(person_id).select('entity_id full_name').lean();
  if (!person) return res.status(404).json({ success: false, message: 'Person not found' });

  const role = functional_role.toUpperCase();

  // Check for existing active duplicates
  const existingDups = await FunctionalRoleAssignment.find({
    person_id,
    entity_id: { $in: entity_ids },
    functional_role: role,
    is_active: true,
    status: 'ACTIVE',
  }).select('entity_id').lean();

  const dupEntityIds = new Set(existingDups.map(d => d.entity_id.toString()));
  const newEntityIds = entity_ids.filter(eid => !dupEntityIds.has(eid.toString()));

  if (newEntityIds.length === 0) {
    return res.status(409).json({
      success: false,
      message: 'All selected entities already have an active assignment for this person and role',
    });
  }

  const docs = newEntityIds.map(eid => ({
    entity_id: eid,
    person_id,
    home_entity_id: person.entity_id,
    functional_role: role,
    valid_from,
    valid_to: valid_to || null,
    approval_limit: approval_limit || null,
    description: description || '',
    created_by: req.user._id,
  }));

  const created = await FunctionalRoleAssignment.insertMany(docs);

  const populated = await FunctionalRoleAssignment.find({
    _id: { $in: created.map(c => c._id) },
  }).populate(POPULATE_FIELDS).lean();

  const skipped = entity_ids.length - newEntityIds.length;
  res.status(201).json({
    success: true,
    data: populated,
    message: `Created ${populated.length} assignment(s)${skipped > 0 ? `, skipped ${skipped} duplicate(s)` : ''}`,
  });
});

module.exports = {
  listAssignments,
  getAssignment,
  getByPerson,
  createAssignment,
  updateAssignment,
  deactivateAssignment,
  bulkCreate,
};
