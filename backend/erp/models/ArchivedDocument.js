/**
 * Archived Document Model — Data Archival (Phase 15.8)
 * Stores archived documents from closed periods
 */
const mongoose = require('mongoose');

const archivedDocumentSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  batch_id: { type: String, required: true },
  source_collection: { type: String, required: true },
  source_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  period: { type: String },
  document: { type: mongoose.Schema.Types.Mixed, required: true },
  archived_at: { type: Date, default: Date.now }
}, { collection: 'erp_archived_documents' });

archivedDocumentSchema.index({ entity_id: 1, batch_id: 1 });
archivedDocumentSchema.index({ entity_id: 1, source_collection: 1, source_id: 1 });

module.exports = mongoose.model('ArchivedDocument', archivedDocumentSchema);
