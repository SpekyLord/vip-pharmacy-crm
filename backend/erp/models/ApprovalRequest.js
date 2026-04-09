/**
 * Approval Request Model — Phase 28 (Authority Matrix)
 *
 * Tracks individual approval requests for documents that require authorization.
 * Created when a document hits a rule threshold; resolved when approved/rejected.
 *
 * Immutable audit trail — status transitions are append-only via the history array.
 */

const mongoose = require('mongoose');

const approvalRequestSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true,
    index: true,
  },

  // The approval rule that triggered this request
  rule_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ApprovalRule',
    required: true,
  },

  // What document needs approval
  module: {
    type: String,
    required: true,
  },
  doc_type: {
    type: String,
    required: true,
  },
  doc_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  doc_ref: {
    type: String, // human-readable reference (PO number, CSI number, etc.)
  },
  amount: {
    type: Number,
  },
  description: {
    type: String,
  },

  // Approval level this request is for
  level: {
    type: Number,
    default: 1,
  },

  // Who requested
  requested_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  requested_at: {
    type: Date,
    default: Date.now,
    immutable: true,
  },

  // Current status
  status: {
    type: String,
    default: 'PENDING',
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
    index: true,
  },

  // Who decided (if resolved)
  decided_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  decided_at: {
    type: Date,
  },
  decision_reason: {
    type: String,
  },

  // Immutable history of status changes
  history: [{
    status: String,
    by: mongoose.Schema.Types.ObjectId,
    at: { type: Date, default: Date.now },
    reason: String,
  }],
}, {
  timestamps: true,
  collection: 'erp_approval_requests',
});

// Indexes for common queries
approvalRequestSchema.index({ entity_id: 1, status: 1, module: 1 });
approvalRequestSchema.index({ requested_by: 1, status: 1 });
approvalRequestSchema.index({ doc_id: 1, level: 1 });

module.exports = mongoose.model('ApprovalRequest', approvalRequestSchema);
