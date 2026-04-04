/**
 * Archive Batch Model — Data Archival (Phase 15.8)
 * Tracks archive operations for traceability
 */
const mongoose = require('mongoose');

const archiveBatchSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  batch_id: { type: String, required: true, unique: true },
  archived_at: { type: Date, default: Date.now },
  archived_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  cutoff_period: { type: String, required: true },
  periods_archived: [String],
  counts: {
    sales_lines: { type: Number, default: 0 },
    collections: { type: Number, default: 0 },
    expense_entries: { type: Number, default: 0 },
    smer_entries: { type: Number, default: 0 },
    car_logbook_entries: { type: Number, default: 0 },
    transaction_events: { type: Number, default: 0 },
    journal_entries: { type: Number, default: 0 }
  },
  total_documents: { type: Number, default: 0 },
  status: { type: String, enum: ['COMPLETED', 'RESTORED', 'FAILED'], default: 'COMPLETED' },
  restored_at: Date,
  restored_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  restore_reason: { type: String, trim: true }
}, { timestamps: true, collection: 'erp_archive_batches' });

archiveBatchSchema.index({ entity_id: 1, batch_id: 1 });
archiveBatchSchema.index({ entity_id: 1, status: 1 });

module.exports = mongoose.model('ArchiveBatch', archiveBatchSchema);
