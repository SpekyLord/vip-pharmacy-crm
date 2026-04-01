const mongoose = require('mongoose');

const documentAttachmentSchema = new mongoose.Schema({
  event_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TransactionEvent',
    required: true
  },
  document_type: {
    type: String,
    required: true
  },
  ocr_applied: {
    type: Boolean,
    default: false
  },
  storage_url: {
    type: String,
    required: true
  },
  folder_path: {
    type: String
  },
  uploaded_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploaded_at: {
    type: Date,
    default: Date.now
  }
});

// Indexes
documentAttachmentSchema.index({ event_id: 1 });
documentAttachmentSchema.index({ document_type: 1 });

module.exports = mongoose.model('DocumentAttachment', documentAttachmentSchema);
