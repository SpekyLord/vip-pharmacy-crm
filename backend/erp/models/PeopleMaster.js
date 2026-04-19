const mongoose = require('mongoose');

// Fallback values if Lookup table not yet seeded for this entity
const FALLBACK_PERSON_TYPES = ['BDM', 'ECOMMERCE_BDM', 'EMPLOYEE', 'SALES_REP', 'CONSULTANT', 'DIRECTOR'];
const FALLBACK_EMPLOYMENT_TYPES = ['REGULAR', 'PROBATIONARY', 'CONTRACTUAL', 'CONSULTANT', 'PARTNERSHIP'];
const FALLBACK_BDM_STAGES = ['', 'CONTRACTOR', 'PS_ELIGIBLE', 'TRANSITIONING', 'SUBSIDIARY', 'SHAREHOLDER'];

const peopleMasterSchema = new mongoose.Schema(
  {
    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Entity',
      required: [true, 'Entity is required'],
    },
    person_type: {
      type: String,
      required: [true, 'Person type is required'],
      uppercase: true,
      trim: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // ═══ Name ═══
    full_name: { type: String, required: [true, 'Full name is required'], trim: true },
    first_name: { type: String, required: [true, 'First name is required'], trim: true },
    last_name: { type: String, required: [true, 'Last name is required'], trim: true },

    // ═══ BDM Code & Role ═══
    bdm_code: { type: String, trim: true, default: '' },    // Short identifier e.g. "Mae Navarro"
    role_notes: { type: String, trim: true, default: '' },   // e.g. "Field BDM", "eBDM", "President"

    // ═══ Position ═══
    position: { type: String, trim: true, default: '' },
    department: { type: String, trim: true, default: '' },

    // ═══ Org Chart ═══
    reports_to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PeopleMaster',
      default: null,
    },

    // ═══ Contact ═══
    email: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    avatar: { type: String, default: '' },

    // ═══ Territory ═══
    territory_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Territory',
      default: null,
    },

    // ═══ Partner Stage (career path: CONTRACTOR → PS_ELIGIBLE → TRANSITIONING → SUBSIDIARY → SHAREHOLDER) ═══
    bdm_stage: {
      type: String,
      uppercase: true,
      trim: true,
      default: '',
    },

    // ═══ Employment ═══
    employment_type: {
      type: String,
      uppercase: true,
      trim: true,
      default: 'PROBATIONARY',
    },
    date_hired: { type: Date },
    date_regularized: { type: Date },
    date_separated: { type: Date },
    date_of_birth: { type: Date },
    live_date: { type: Date }, // ERP go-live date — CSI before this = OPENING_AR, after = SALES_LINE

    // ═══ Civil Status ═══
    civil_status: {
      type: String,
      default: 'SINGLE',
    }, // Lookup: CIVIL_STATUS

    // ═══ Government IDs (sensitive) ═══
    government_ids: {
      sss_no: { type: String, select: false },
      philhealth_no: { type: String, select: false },
      pagibig_no: { type: String, select: false },
      tin: { type: String, select: false },
    },

    // ═══ Bank Account (sensitive) ═══
    bank_account: {
      bank: { type: String, select: false },
      account_no: { type: String, select: false },
      account_name: { type: String, select: false },
    },

    // ═══ Compensation Link ═══
    comp_profile_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CompProfile',
      default: null,
    },

    // ═══ Status ═══
    is_active: { type: Boolean, default: true },
    status: {
      type: String,
      default: 'ACTIVE',
    }, // Lookup: PEOPLE_STATUS

    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    collection: 'erp_people_master',
  }
);

/**
 * Pre-validate hook: validate person_type, employment_type, bdm_stage against Lookup tables.
 * Falls back to hardcoded defaults if Lookup table not yet seeded for this entity.
 * This makes these fields fully manageable via Control Center → Lookup Tables.
 */
peopleMasterSchema.pre('validate', async function (next) {
  const Lookup = mongoose.models.Lookup || require('./Lookup');
  const entityId = this.entity_id;

  const validateField = async (fieldName, category, fallbackValues) => {
    if (!this.isModified(fieldName)) return;
    const val = this[fieldName];
    if (!val && val !== 0) return; // allow empty/null

    if (entityId) {
      const validCodes = await Lookup.distinct('code', {
        entity_id: entityId,
        category,
        is_active: true,
      });
      if (validCodes.length > 0) {
        if (!validCodes.includes(val)) {
          return this.invalidate(fieldName, `Invalid ${fieldName}: ${val}. Valid values: ${validCodes.join(', ')}`);
        }
        return;
      }
    }
    // Fallback to defaults if Lookup not yet seeded
    if (!fallbackValues.includes(val)) {
      this.invalidate(fieldName, `Invalid ${fieldName}: ${val}. Valid values: ${fallbackValues.join(', ')}`);
    }
  };

  await Promise.all([
    validateField('person_type', 'PERSON_TYPE', FALLBACK_PERSON_TYPES),
    validateField('employment_type', 'EMPLOYMENT_TYPE', FALLBACK_EMPLOYMENT_TYPES),
    validateField('bdm_stage', 'BDM_STAGE', FALLBACK_BDM_STAGES),
  ]);
  next();
});

peopleMasterSchema.index({ entity_id: 1, person_type: 1 });
peopleMasterSchema.index({ entity_id: 1, is_active: 1 });
peopleMasterSchema.index({ user_id: 1 }, { sparse: true });
peopleMasterSchema.index({ entity_id: 1, full_name: 'text' });
peopleMasterSchema.index({ entity_id: 1, reports_to: 1 });

// ═══════════════════════════════════════════════════════════════════════════
// Phase SG-6 #30 — Sales-Goal lifecycle hooks (HRIS-free).
// Captures the pre-save state so the post-save hook can classify the
// transition (enroll / close / revise). Additive: does NOT replace any
// pre-existing hook. Hook logic lives in salesGoalLifecycleHooks.js — it
// wraps its own writes in a transaction and swallows errors so a Sales
// Goal issue never blocks a PeopleMaster save.
// ═══════════════════════════════════════════════════════════════════════════
peopleMasterSchema.pre('save', async function (next) {
  try {
    this.__sgIsNew = this.isNew;
    if (this.isNew) {
      this.__sgPrior = null;
    } else {
      // Only snapshot the fields the lifecycle hook inspects. Keeps the
      // synthetic prior object tiny + avoids lazy-loading select:false rows.
      const prior = await this.constructor.findById(this._id)
        .select('is_active person_type territory_id entity_id')
        .lean();
      this.__sgPrior = prior || null;
    }
  } catch (err) {
    // Non-fatal — prior capture failure degrades the hook to a fresh-enroll
    // judgement, but never blocks the save.
    console.warn('[PeopleMaster.pre-save sg-lifecycle capture] failed:', err.message);
    this.__sgPrior = null;
    this.__sgIsNew = false;
  }
  next();
});

peopleMasterSchema.post('save', function (doc) {
  // Lazy require to avoid circular deps at model-load time.
  try {
    const { onPersonChanged } = require('../services/salesGoalLifecycleHooks');
    // Fire-and-forget. onPersonChanged has its own error handling + txn isolation.
    Promise.resolve().then(() => onPersonChanged(doc)).catch(err => {
      console.error('[PeopleMaster.post-save sg-lifecycle] failed:', err.message);
    });
  } catch (err) {
    // require() itself failed (e.g. missing service during tests) — ignore.
    console.warn('[PeopleMaster.post-save sg-lifecycle] require skipped:', err.message);
  }
});

module.exports = mongoose.model('PeopleMaster', peopleMasterSchema);
