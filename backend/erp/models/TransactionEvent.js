const mongoose = require('mongoose');

const IMMUTABLE_FIELDS = [
  'entity_id', 'bdm_id', 'event_type', 'event_date',
  'document_ref', 'source_image_url', 'ocr_raw_json',
  'confirmed_fields', 'payload', 'created_by', 'created_at'
];

const transactionEventSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  bdm_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  event_type: {
    type: String,
    required: true
  },
  event_date: {
    type: Date,
    required: true
  },
  document_ref: {
    type: String
  },
  source_image_url: {
    type: String
  },
  ocr_raw_json: {
    type: mongoose.Schema.Types.Mixed
  },
  confirmed_fields: {
    type: mongoose.Schema.Types.Mixed
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'DELETED'],
    default: 'ACTIVE'
  },
  // Phase 9.3: Document flow linking (CSI → CR → CWT → Deposit chain)
  linked_events: [{
    event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },
    relationship: { type: String, enum: ['SETTLES', 'CERTIFIES', 'DEPOSITS', 'REVERSES'] }
  }],
  corrects_event_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TransactionEvent',
    default: null
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  created_at: {
    type: Date,
    immutable: true,
    default: Date.now
  }
}, {
  timestamps: false // We manage created_at ourselves; no updatedAt needed
});

// Prevent save-based updates on existing documents
transactionEventSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(new Error('TransactionEvent documents are immutable. Use findOneAndUpdate to change status only.'));
  }
  this.created_at = new Date();
  next();
});

// Strip immutable fields from any update — only status and linked_events can change
transactionEventSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  if (update.$set) {
    for (const field of IMMUTABLE_FIELDS) {
      delete update.$set[field];
    }
    // Only allow status transition ACTIVE → DELETED
    if (update.$set.status && update.$set.status !== 'DELETED') {
      return next(new Error('TransactionEvent status can only transition to DELETED'));
    }
  }
  // $push on linked_events is always allowed (Phase 9.3 document flow)
  next();
});

transactionEventSchema.pre('updateOne', function (next) {
  const update = this.getUpdate();
  if (update.$set) {
    for (const field of IMMUTABLE_FIELDS) {
      delete update.$set[field];
    }
  }
  next();
});

// Indexes
transactionEventSchema.index({ entity_id: 1, bdm_id: 1 });
transactionEventSchema.index({ entity_id: 1, event_type: 1 });
transactionEventSchema.index({ entity_id: 1, event_date: -1 });
transactionEventSchema.index({ corrects_event_id: 1 });
transactionEventSchema.index({ 'linked_events.event_id': 1 });
transactionEventSchema.index({ status: 1 });

module.exports = mongoose.model('TransactionEvent', transactionEventSchema);
