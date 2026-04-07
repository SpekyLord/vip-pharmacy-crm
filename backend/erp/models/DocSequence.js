/**
 * DocSequence Model — Atomic counter for document numbering
 *
 * Each key represents a unique numbering context:
 *   "CALF-ILO-040326" → current_seq: 3 (next CALF in Iloilo on April 3 = 004)
 *   "PRF-MNL-040326"  → current_seq: 1 (next PRF in Manila on April 3 = 002)
 *
 * Uses MongoDB atomic findOneAndUpdate with $inc for collision-safe incrementing.
 */
const mongoose = require('mongoose');

const docSequenceSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true },
  current_seq: { type: Number, default: 0 }
}, {
  timestamps: false,
  collection: 'erp_doc_sequences'
});

/**
 * Get next sequence number atomically
 * @param {String} key — e.g., "CALF-ILO-040326"
 * @returns {Promise<Number>} next sequence (1-based)
 */
docSequenceSchema.statics.getNext = async function (key) {
  const result = await this.findOneAndUpdate(
    { key },
    { $inc: { current_seq: 1 } },
    { upsert: true, new: true }
  );
  return result.current_seq;
};

module.exports = mongoose.model('DocSequence', docSequenceSchema);
