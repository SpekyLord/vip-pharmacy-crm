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

  // ── BIR tax registration block (Phase VIP-1.J — compliance dashboard) ──
  // Drives /erp/bir form universe, withholding engine activation, and
  // 1701 vs 1702 selection at year-end. All fields optional today; the
  // Data Quality Agent flags entities missing these before BIR deadlines.
  tax_type: {
    type: String,
    enum: ['CORP', 'OPC', 'SOLE_PROP', 'PARTNERSHIP'],
    default: 'CORP',
  },
  rdo_code: { type: String, trim: true, maxlength: 6 },
  business_style: { type: String, trim: true, maxlength: 120 },
  top_withholding_agent: { type: Boolean, default: false },
  // BIR confirmation emails (eBIR Forms / eFPS receipt) are forwarded to this
  // address; the Email Confirmation Bridge agent parses them and flips
  // BirFilingStatus rows to CONFIRMED. CEO defaults to yourpartner@viosintegrated.net.
  tax_filing_email: { type: String, trim: true, lowercase: true, maxlength: 120 },
  // Master switch for the contractor 1601-EQ withholding engine. Off by
  // default — flips on per-entity once profit-sharing kicks in. The
  // per-contractor toggle lives on PeopleMaster.withhold_active.
  withholding_active: { type: Boolean, default: false },
  // RA 11534 / TRAIN-CREATE Act: maintenance medicines for these conditions
  // are VAT-exempt. Drives 2550M classification and storefront tagging
  // when the online pharmacy launches.
  vat_exempt_categories: [{
    type: String,
    enum: ['DIABETES', 'HYPERTENSION', 'CHOLESTEROL', 'CANCER', 'MENTAL_HEALTH', 'KIDNEY', 'TUBERCULOSIS'],
  }],
  // Form 1606 (5% withholding on real property rent). Per-entity opt-in
  // because a holding entity may not pay rent today (VIP/MG/CO) but the
  // online pharmacy or a SaaS subscriber will.
  rent_withholding_active: { type: Boolean, default: false },

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
entitySchema.index({ tax_type: 1 });
entitySchema.index({ rdo_code: 1 });

// ── TIN normalizer + validator (Phase VIP-1.J) ──
// BIR canonical TIN format is XXX-XXX-XXX-XXXXX (9 + 5 branch code = 14 digits
// total). Accepts inputs with spaces, dashes, or runs of digits and re-formats.
// Empty TIN is allowed (Data Quality Agent reports it); a non-empty value that
// cannot be normalized to 9 or 14 digits fails validation.
entitySchema.pre('validate', function (next) {
  if (this.tin && typeof this.tin === 'string') {
    const digits = this.tin.replace(/\D/g, '');
    if (digits.length === 9) {
      this.tin = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}-00000`;
    } else if (digits.length === 12) {
      this.tin = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}-${digits.slice(9, 12).padEnd(5, '0')}`;
    } else if (digits.length === 14) {
      this.tin = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}-${digits.slice(9, 14)}`;
    } else if (digits.length > 0) {
      return next(new Error(`TIN must be 9 or 14 digits (got ${digits.length}). BIR canonical format: XXX-XXX-XXX-XXXXX.`));
    } else {
      this.tin = '';
    }
  }
  next();
});

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
