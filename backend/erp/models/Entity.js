const mongoose = require('mongoose');

const entitySchema = new mongoose.Schema({
  entity_name: {
    type: String,
    required: [true, 'Entity name is required'],
    trim: true
  },
  short_name: {
    type: String,
    trim: true
  },
  tin: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  vat_registered: {
    type: Boolean,
    default: false
  },
  entity_type: {
    type: String,
    enum: ['PARENT', 'SUBSIDIARY'],
    required: true
  },
  parent_entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    default: null
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE'],
    default: 'ACTIVE'
  },

  // Entity management — who runs this entity
  managed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PeopleMaster',
    default: null,
  },

  // Branding (Phase 4B.7)
  brand_color: { type: String, default: '#6B7280' },
  brand_text_color: { type: String, default: '#FFFFFF' },
  logo_url: { type: String },
  tagline: { type: String, trim: true }
}, {
  timestamps: true
});

// Indexes
entitySchema.index({ entity_type: 1 });
entitySchema.index({ status: 1 });
entitySchema.index({ parent_entity_id: 1 });

// Carry isNew into the post-save hook so we can distinguish creation from updates
entitySchema.pre('save', function (next) {
  this._wasNew = this.isNew;
  next();
});

// Auto-seed per-entity Lookup rows from parent whenever a new SUBSIDIARY
// is created. Non-blocking: errors are logged but don't fail the save.
// Admin can always re-run `backend/erp/scripts/seedSubsidiaryLookups.js`
// manually as a fallback. Keeps subsidiary onboarding one-click.
entitySchema.post('save', async function (doc) {
  if (!doc._wasNew) return;
  if (doc.entity_type !== 'SUBSIDIARY') return;

  // Lazy require to avoid circular dependency (service → Lookup → Entity).
  const {
    seedSubsidiaryLookups,
    resolveReferenceEntityId,
  } = require('../services/subsidiaryLookupSeedService');

  try {
    const referenceEntityId = await resolveReferenceEntityId(doc);
    if (!referenceEntityId) {
      console.warn(`[Entity auto-seed] ${doc.short_name || doc.entity_name}: no parent/PARENT entity found — skipping lookup seed.`);
      return;
    }
    const result = await seedSubsidiaryLookups({
      targetEntityId: doc._id,
      referenceEntityId,
    });
    console.log(`[Entity auto-seed] ${doc.short_name || doc.entity_name}: seeded ${result.seeded}/${result.scanned} lookup rows in ${result.elapsed_ms}ms.`);
  } catch (err) {
    console.error(`[Entity auto-seed] ${doc.short_name || doc.entity_name}: failed — ${err.message}. Run seedSubsidiaryLookups.js manually.`);
  }
});

module.exports = mongoose.model('Entity', entitySchema);
