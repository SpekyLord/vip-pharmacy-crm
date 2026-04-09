/**
 * FunctionalRoleAssignment Model — Phase 31
 *
 * Maps a person (PeopleMaster) to a target entity for a specific function
 * (Purchasing, Accounting, Collections, etc.) with optional date ranges
 * and approval limits.
 *
 * Enables cross-entity deployment:
 *   "This accountant handles accounting for VIP HQ AND MG AND CO"
 *   "Deploy this contractor to Entity Y for inventory audit this week"
 *
 * Admin/President maintains these via Control Center → People & Access → Role Assignments.
 */

const mongoose = require('mongoose');

const FALLBACK_FUNCTIONAL_ROLES = [
  'PURCHASING', 'ACCOUNTING', 'COLLECTIONS', 'INVENTORY',
  'SALES', 'ADMIN', 'AUDIT', 'PAYROLL', 'LOGISTICS',
];

const functionalRoleAssignmentSchema = new mongoose.Schema({
  // Target entity where this person performs the function
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: [true, 'Target entity is required'],
    index: true,
  },

  // The person being assigned
  person_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PeopleMaster',
    required: [true, 'Person is required'],
    index: true,
  },

  // Person's home/primary entity (denormalized for query efficiency)
  home_entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: [true, 'Home entity is required'],
  },

  // Lookup-driven function type: PURCHASING, ACCOUNTING, COLLECTIONS, etc.
  functional_role: {
    type: String,
    required: [true, 'Functional role is required'],
    uppercase: true,
    trim: true,
  },

  // Assignment validity period
  valid_from: {
    type: Date,
    required: [true, 'Valid-from date is required'],
  },
  valid_to: {
    type: Date,
    default: null, // null = permanent/indefinite
  },

  // Optional spending/approval authority at this entity for this function
  approval_limit: {
    type: Number,
    default: null,
  },

  // Free-text notes
  description: {
    type: String,
    default: '',
    trim: true,
  },

  is_active: {
    type: Boolean,
    default: true,
  },

  status: {
    type: String,
    enum: ['ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED'],
    default: 'ACTIVE',
  },

  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

  updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
  collection: 'erp_functional_role_assignments',
});

// ═══ Indexes ═══

// "Who handles ACCOUNTING at Entity X?"
functionalRoleAssignmentSchema.index({ entity_id: 1, functional_role: 1, is_active: 1 });

// "What entities does Person Y serve?"
functionalRoleAssignmentSchema.index({ person_id: 1, is_active: 1 });

// Uniqueness guard: one active assignment per person+entity+role
functionalRoleAssignmentSchema.index({ person_id: 1, entity_id: 1, functional_role: 1 });

// Expiry queries
functionalRoleAssignmentSchema.index({ valid_to: 1 });

// ═══ Pre-validate: check functional_role against Lookup ═══

functionalRoleAssignmentSchema.pre('validate', async function (next) {
  if (!this.isModified('functional_role')) return next();

  const val = this.functional_role;
  if (!val) return next();

  const Lookup = mongoose.models.Lookup || require('./Lookup');
  const entityId = this.entity_id;

  if (entityId) {
    const validCodes = await Lookup.distinct('code', {
      entity_id: entityId,
      category: 'FUNCTIONAL_ROLE',
      is_active: true,
    });
    if (validCodes.length > 0) {
      if (!validCodes.includes(val)) {
        this.invalidate('functional_role', `Invalid functional_role: ${val}. Valid values: ${validCodes.join(', ')}`);
      }
      return next();
    }
  }

  // Fallback to defaults if Lookup not yet seeded
  if (!FALLBACK_FUNCTIONAL_ROLES.includes(val)) {
    this.invalidate('functional_role', `Invalid functional_role: ${val}. Valid values: ${FALLBACK_FUNCTIONAL_ROLES.join(', ')}`);
  }
  next();
});

module.exports = mongoose.model('FunctionalRoleAssignment', functionalRoleAssignmentSchema);
