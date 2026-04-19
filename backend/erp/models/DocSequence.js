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
 * @param {Object} [options]
 * @param {ClientSession} [options.session] — pass to enlist this counter bump in
 *   a caller-managed mongoose transaction. Phase SG-Q2 W3 added this so the
 *   incentive accrual flow (JE create + IncentivePayout upsert) stays atomic
 *   under concurrent runs of kpiSnapshotAgent + manual recompute. Without a
 *   session the upsert still works the same (legacy behavior preserved).
 * @returns {Promise<Number>} next sequence (1-based)
 */
docSequenceSchema.statics.getNext = async function (key, options = {}) {
  const opts = { upsert: true, new: true };
  if (options.session) opts.session = options.session;
  const result = await this.findOneAndUpdate(
    { key },
    { $inc: { current_seq: 1 } },
    opts
  );
  return result.current_seq;
};

module.exports = mongoose.model('DocSequence', docSequenceSchema);
