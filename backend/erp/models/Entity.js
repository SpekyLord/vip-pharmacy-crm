const mongoose = require('mongoose');

// Positional card sub-schema used by the CLM pitch slides (startup pillars,
// solution cards, integrity cards). `_id: false` because ordering is locked
// to the existing CSS grid — not queryable standalone.
const clmPillarCardSchema = new mongoose.Schema({
  icon: { type: String, trim: true, maxlength: 8 },    // emoji (U+1F4CD, U+2705, etc.)
  title: { type: String, trim: true, maxlength: 60 },
  body: { type: String, trim: true, maxlength: 400 },
}, { _id: false });

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
  tagline: { type: String, trim: true },

  // CLM Partnership Presentation branding + slide content (Phase 5 / PR1).
  // All fields optional — CLMPresenter falls back to CLM_DEFAULTS for any
  // field left blank. Positional pillar/card arrays preserve the hardcoded
  // CSS grid layout (3 startup pillars, 4 solution cards, 4 integrity cards).
  clmBranding: {
    // ── Logos + identity ─────────────────────────────────────────────
    logoCircleUrl: { type: String, trim: true },
    logoTrademarkUrl: { type: String, trim: true },
    primaryColor: { type: String, trim: true, match: /^#[0-9A-Fa-f]{6}$/ },
    companyName: { type: String, trim: true, maxlength: 120 },
    websiteUrl: { type: String, trim: true, maxlength: 200 },
    salesEmail: { type: String, trim: true, maxlength: 120, lowercase: true },
    phone: { type: String, trim: true, maxlength: 40 },

    // ── Slide body text ──────────────────────────────────────────────
    slides: {
      hero: {
        titleAccent: { type: String, trim: true, maxlength: 60 },
        badge: { type: String, trim: true, maxlength: 60 },
        subtitle: { type: String, trim: true, maxlength: 300 },
      },
      startup: {
        title: { type: String, trim: true, maxlength: 80 },
        lead: { type: String, trim: true, maxlength: 300 },
        pillars: {
          type: [clmPillarCardSchema],
          validate: { validator: (v) => !v || v.length <= 3, message: 'Max 3 startup pillars.' },
        },
      },
      solution: {
        title: { type: String, trim: true, maxlength: 100 },
        lead: { type: String, trim: true, maxlength: 300 },
        cards: {
          type: [clmPillarCardSchema],
          validate: { validator: (v) => !v || v.length <= 4, message: 'Max 4 solution cards.' },
        },
      },
      integrity: {
        title: { type: String, trim: true, maxlength: 100 },
        lead: { type: String, trim: true, maxlength: 300 },
        cards: {
          type: [clmPillarCardSchema],
          validate: { validator: (v) => !v || v.length <= 4, message: 'Max 4 integrity cards.' },
        },
      },
      products: {
        footer: { type: String, trim: true, maxlength: 300 },
      },
      connect: {
        title: { type: String, trim: true, maxlength: 80 },
        subtitle: { type: String, trim: true, maxlength: 300 },
        messengerTitle: { type: String, trim: true, maxlength: 80 },
        messengerBody: { type: String, trim: true, maxlength: 200 },
      },
    },
  },
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
