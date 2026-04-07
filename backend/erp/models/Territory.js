/**
 * Territory Model — Admin-managed territory codes for document numbering
 *
 * Territory code feeds into all ERP document numbers:
 *   CALF-ILO040326-001 = CALF + Iloilo + April 3 2026 + sequence 1
 *   PRF-MNL040326-002 = PRF + Manila + April 3 2026 + sequence 2
 *
 * Pattern: {DOC_PREFIX}-{TERRITORY_CODE}{MMDDYY}-{NNN}
 * Finance can pinpoint territory + BDM from any document number.
 */
const mongoose = require('mongoose');

const territorySchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity' },
  territory_code: {
    type: String,
    required: [true, 'Territory code is required'],
    trim: true,
    uppercase: true,
    minlength: 2,
    maxlength: 5
  },
  territory_name: {
    type: String,
    required: [true, 'Territory name is required'],
    trim: true
  },
  region: { type: String, trim: true },
  assigned_bdms: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  is_active: { type: Boolean, default: true }
}, {
  timestamps: true,
  collection: 'erp_territories'
});

// Unique territory code per entity
territorySchema.index({ entity_id: 1, territory_code: 1 }, { unique: true });
territorySchema.index({ assigned_bdms: 1 });
territorySchema.index({ is_active: 1 });

/**
 * Get territory code for a BDM user
 * @param {ObjectId} bdmId
 * @returns {Promise<String|null>} territory_code or null
 */
territorySchema.statics.getCodeForBdm = async function (bdmId) {
  const territory = await this.findOne({
    assigned_bdms: bdmId,
    is_active: true
  }).select('territory_code').lean();
  return territory?.territory_code || null;
};

module.exports = mongoose.model('Territory', territorySchema);
