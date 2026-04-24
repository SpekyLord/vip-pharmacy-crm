/**
 * Doctor Model (VIP Client)
 *
 * This model represents VIP Clients (doctors/healthcare providers) visited by BDMs (employees).
 *
 * Key features:
 * - Visit frequency: 2x or 4x monthly (no A/B/C/D categorization)
 * - Assignment-based access (assignedTo field)
 * - Name split into firstName + lastName for Call Plan Template format
 * - Free-form specialization (not enum)
 * - Level of engagement tracking (1-5 scale)
 * - Target products (3 slots with showcasing/accepted status)
 * - Programs and support type tracking
 */

const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters'],
    },
    // Phase A.5 (Apr 2026) — Canonical name key mirroring ERP Customer.customer_name_clean
    // and Hospital.hospital_name_clean. Populated by pre-save / pre-findOneAndUpdate hooks
    // from lastName + firstName. Non-unique today (A.5.1); flipped to globally unique by
    // A.5.2 migration script after admin dedup via A.5.5 merge tool. See plan:
    // ~/.claude/plans/phase-a5-canonical-vip-client.md
    vip_client_name_clean: {
      type: String,
      trim: true,
    },
    // Free-form specialization (client uses "Pedia Hema", "Im Car", "Breast Surg", etc.)
    specialization: {
      type: String,
      trim: true,
    },
    // Single address field (merged from old hospital + address fields)
    clinicOfficeAddress: {
      type: String,
      trim: true,
      maxlength: [500, 'Clinic/Office address cannot exceed 500 characters'],
    },
    // Phase G1.5 (Apr 2026) — Structured locality + province for SMER per-diem notes
    // (e.g. "Iloilo City, Iloilo"). Populated from PH_LOCALITIES / PH_PROVINCES lookups.
    // Optional in schema so legacy records stay readable; validation layer requires
    // them on new Doctor creation. Backfill script fills existing rows best-effort.
    locality: {
      type: String,
      trim: true,
      maxlength: [100, 'Locality cannot exceed 100 characters'],
      index: true,
    },
    province: {
      type: String,
      trim: true,
      maxlength: [100, 'Province cannot exceed 100 characters'],
      index: true,
    },
    // GeoJSON for location-based queries
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0],
      },
    },
    phone: {
      type: String,
      trim: true,
      match: [/^[0-9+\-() ]{10,20}$/, 'Please enter a valid phone number'],
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please enter a valid email',
      ],
    },
    // Visit frequency: 2x or 4x monthly (replaces A/B/C/D category)
    visitFrequency: {
      type: Number,
      enum: {
        values: [2, 4],
        message: 'Visit frequency must be 2 or 4 visits per month',
      },
      default: 4,
      required: true,
    },
    // Employee assigned to visit this doctor
    // NOTE: Scalar today. A.5.4 (not yet shipped) flips this to an array so multiple BDMs
    // can cover one VIP Client (e.g. Jake + Romela both visiting Dr. Sharon in Iloilo).
    // `primaryAssignee` below is the forward-compatible scalar that A.5.4 migrates to.
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Phase A.5 (Apr 2026) — Primary ownership scalar. Forward-compatible with A.5.4's
    // `assignedTo` scalar→array flip. Today it mirrors `assignedTo`; after A.5.4 it stays
    // scalar while `assignedTo[]` holds every BDM who covers this MD. The A.5.1 migration
    // script seeds this from the existing `assignedTo` scalar so no app-level read fails.
    primaryAssignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: {
      type: String,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Phase A.5 (Apr 2026) — Soft-delete marker set by A.5.5 merge tool. When populated,
    // this Doctor was absorbed into `mergedInto`. Kept for 30 days after `mergedAt` for
    // rollback; hard-deleted by daily cron thereafter. A Doctor with `mergedInto` must
    // also have `isActive: false` (enforced by health check).
    mergedInto: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      default: null,
    },
    mergedAt: {
      type: Date,
      default: null,
    },
    // Clinic/office schedule for planning
    clinicSchedule: {
      monday: { type: Boolean, default: true },
      tuesday: { type: Boolean, default: true },
      wednesday: { type: Boolean, default: true },
      thursday: { type: Boolean, default: true },
      friday: { type: Boolean, default: true },
    },
    // --- New fields (Task A.1) ---
    outletIndicator: {
      type: String,
      trim: true,
    },
    // Dynamic arrays — values managed via /api/programs and /api/support-types
    programsToImplement: [{ type: String, trim: true }],
    supportDuringCoverage: [{ type: String, trim: true }],
    // Level of engagement: 1=visited 4x, 2=knows BDM/products, 3=tried products, 4=in GC, 5=active partner
    levelOfEngagement: {
      type: Number,
      min: [1, 'Level of engagement must be at least 1'],
      max: [5, 'Level of engagement cannot exceed 5'],
    },
    secretaryName: {
      type: String,
      trim: true,
    },
    secretaryPhone: {
      type: String,
      trim: true,
    },
    // Multi-channel contact info
    whatsappNumber: {
      type: String,
      trim: true,
    },
    viberId: {
      type: String,
      trim: true,
      maxlength: [100, 'Viber ID cannot exceed 100 characters'],
    },
    messengerId: {
      type: String,
      trim: true,
      maxlength: [100, 'Messenger ID cannot exceed 100 characters'],
    },
    preferredChannel: {
      type: String,
      trim: true,
    },
    birthday: {
      type: Date,
    },
    anniversary: {
      type: Date,
    },
    otherDetails: {
      type: String,
      maxlength: [2000, 'Other details cannot exceed 2000 characters'],
    },
    // 3 target product slots — BDM showcases products, marks as accepted when VIP Client likes it
    targetProducts: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'CrmProduct',
        },
        status: {
          type: String,
          enum: {
            values: ['showcasing', 'accepted'],
            message: 'Product status must be showcasing or accepted',
          },
          default: 'showcasing',
        },
      },
    ],
    // Whether admin has approved this doctor as VIP partner
    isVipAssociated: {
      type: Boolean,
      default: false,
    },
    // Lookup: VIP_CLIENT_TYPE — no hardcoded enum (Phase C compliance)
    // Distinguishes MDs from other stakeholders (pharmacist, purchaser, administrator, etc.)
    clientType: {
      type: String,
      trim: true,
      default: 'MD',
    },
    // Hospital affiliations — VIP Clients can be at multiple hospitals
    // MDs bring patients to different hospitals; stakeholders may serve multiple facilities
    hospitals: [{
      hospital_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
      is_primary: { type: Boolean, default: false },
    }],

    // Phase M1 (Apr 2026) — Per-channel marketing consent ledger (RA 10173 DPA).
    // Written on inbound reply to an invite link (source='invite_reply') or via
    // manual admin capture (source='paper_form'|'verbal'). `withdrawn_at` is the
    // unsubscribe timestamp — once set, the campaign dispatcher (M2) skips this
    // channel for this recipient regardless of `consented`. Shape mirrored on Client.
    marketingConsent: {
      MESSENGER: {
        consented: { type: Boolean, default: false },
        at: { type: Date, default: null },
        source: { type: String, default: null },
        withdrawn_at: { type: Date, default: null },
      },
      VIBER: {
        consented: { type: Boolean, default: false },
        at: { type: Date, default: null },
        source: { type: String, default: null },
        withdrawn_at: { type: Date, default: null },
      },
      WHATSAPP: {
        consented: { type: Boolean, default: false },
        at: { type: Date, default: null },
        source: { type: String, default: null },
        withdrawn_at: { type: Date, default: null },
      },
      EMAIL: {
        consented: { type: Boolean, default: false },
        at: { type: Date, default: null },
        source: { type: String, default: null },
        withdrawn_at: { type: Date, default: null },
      },
      SMS: {
        consented: { type: Boolean, default: false },
        at: { type: Date, default: null },
        source: { type: String, default: null },
        withdrawn_at: { type: Date, default: null },
      },
    },

    // Phase M1 (Apr 2026) — MD Partner Program enrollment scaffold.
    // Gated behind `MD_PARTNER_LIVE` lookup flag until counsel clears the agreement
    // template. Referral code is printed on Rx pads / given to patient; patient
    // enters it at vippharmacy.online checkout; rebate accrues on COMPLETED order
    // (Phase M3). Rebate is % of order value, brand-agnostic (RA 6675 compliance).
    partnerProgram: {
      enrolled: { type: Boolean, default: false },
      referralCode: { type: String, default: null, trim: true, uppercase: true },
      tin: { type: String, default: null, trim: true },
      enrolledAt: { type: Date, default: null },
      agreementUrl: { type: String, default: null },
      agreementVersion: { type: String, default: null },
      payoutMethod: { type: String, default: null, trim: true },
      withholdingCategory: { type: String, default: null, trim: true },
    },
  },
  {
    collection: 'doctors',
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
doctorSchema.index({ assignedTo: 1 });
doctorSchema.index({ specialization: 1 });
doctorSchema.index({ isActive: 1 });
doctorSchema.index({ firstName: 'text', lastName: 'text', clinicOfficeAddress: 'text' }); // Text search
doctorSchema.index({ location: '2dsphere' }); // Geospatial queries
// Compound indexes for common query patterns
doctorSchema.index({ assignedTo: 1, isActive: 1 });
doctorSchema.index({ lastName: 1, firstName: 1 }); // For alphabetical sorting
doctorSchema.index({ supportDuringCoverage: 1 });
doctorSchema.index({ programsToImplement: 1 });
doctorSchema.index({ clientType: 1 });
doctorSchema.index({ 'hospitals.hospital_id': 1 });
// Phase A.5 (Apr 2026) — Canonical key lookup index. NON-UNIQUE today because
// pre-A.5.5-dedup data contains duplicates (e.g. Jake + Romela both covering Iloilo
// created separate "Dr. Sharon" records). A.5.2 migration script flips this to
// `{ unique: true }` via `Doctor.syncIndexes()` AFTER admin merges duplicates through
// the A.5.5 admin merge tool. Mirrors Customer.js:108 / Hospital.js:105 in final shape.
doctorSchema.index({ vip_client_name_clean: 1 });
// Phase A.5 — merged-record lookup (cron hard-delete + rollback queries)
doctorSchema.index({ mergedInto: 1 });
doctorSchema.index({ mergedAt: 1 });
// Phase M1 — partner referral code is unique when set. `sparse` doesn't work here
// because the schema writes `referralCode: null` by default, which the sparse index
// still indexes and then collides across every unenrolled doctor. Partial filter
// restricts the unique constraint to documents that actually have a string code.
doctorSchema.index(
  { 'partnerProgram.referralCode': 1 },
  {
    unique: true,
    partialFilterExpression: { 'partnerProgram.referralCode': { $type: 'string' } },
  }
);

// Virtual: Full name (combines firstName and lastName)
doctorSchema.virtual('fullName').get(function () {
  return `${this.firstName || ''} ${this.lastName || ''}`.trim();
});

// Virtual: Get assigned products (populated via ProductAssignment)
doctorSchema.virtual('assignedProducts', {
  ref: 'ProductAssignment',
  localField: '_id',
  foreignField: 'doctor',
  match: { status: 'active' },
});

// Static: Find doctors assigned to an employee
doctorSchema.statics.findByEmployee = function (employeeId) {
  return this.find({ assignedTo: employeeId, isActive: true });
};

// Static: Find doctors by specialization
doctorSchema.statics.findBySpecialization = function (specialization) {
  return this.find({ specialization, isActive: true });
};

// Instance: Check if doctor is available on a given day
doctorSchema.methods.isAvailableOnDay = function (dayOfWeek) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const day = days[dayOfWeek];
  // Only check Mon-Fri (work days)
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  return this.clinicSchedule?.[day] !== false;
};

// Pre-save hook: auto-clean firstName/lastName to proper case (lookup-driven)
// + Phase A.5 (Apr 2026): maintain vip_client_name_clean canonical key.
// Key shape: `lastname|firstname` (lowercased, inner whitespace collapsed).
// Mirrors Customer.customer_name_clean / Hospital.hospital_name_clean pattern.
doctorSchema.pre('save', async function (next) {
  const nameModified = this.isModified('firstName') || this.isModified('lastName');
  if (!nameModified) return next();
  try {
    const { loadNameRules, cleanName } = require('../utils/nameCleanup');
    const rules = await loadNameRules(null);
    if (this.isModified('firstName') && this.firstName) {
      this.firstName = cleanName(this.firstName, rules);
    }
    if (this.isModified('lastName') && this.lastName) {
      this.lastName = cleanName(this.lastName, rules);
    }
    // Recompute canonical key from the now-cleaned name parts.
    const last = (this.lastName || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const first = (this.firstName || '').toLowerCase().replace(/\s+/g, ' ').trim();
    this.vip_client_name_clean = `${last}|${first}`;
    next();
  } catch (error) {
    next(error);
  }
});

// Phase A.5 (Apr 2026) — mirror pre-save canonical-key recomputation on update paths
// (findOneAndUpdate / findByIdAndUpdate). Matches Customer.js:96-104 pattern. Reads the
// incoming `$set` (or top-level) firstName/lastName; if either present, recompute clean
// parts + canonical key into the same update operator. Does NOT apply cleanName rules
// here (the UI-level input is trusted for casing on update — same as Customer/Hospital).
doctorSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate() || {};
  const $set = update.$set || {};
  const firstName = $set.firstName !== undefined ? $set.firstName : update.firstName;
  const lastName = $set.lastName !== undefined ? $set.lastName : update.lastName;
  if (firstName === undefined && lastName === undefined) return next();

  // Need both parts to build the key. If only one is in the update, fetch the other from
  // the existing doc so the canonical key never goes stale.
  const target = firstName !== undefined && lastName !== undefined
    ? Promise.resolve({ firstName, lastName })
    : this.model.findOne(this.getFilter()).select('firstName lastName').lean().then(doc => ({
        firstName: firstName !== undefined ? firstName : doc?.firstName,
        lastName: lastName !== undefined ? lastName : doc?.lastName,
      }));

  target.then(({ firstName: fn, lastName: ln }) => {
    const last = (ln || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const first = (fn || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const clean = `${last}|${first}`;
    if (update.$set) update.$set.vip_client_name_clean = clean;
    else update.vip_client_name_clean = clean;
    next();
  }).catch(next);
});

// Pre-delete hook to cascade delete related ProductAssignments
doctorSchema.pre('deleteOne', { document: true, query: false }, async function (next) {
  try {
    const ProductAssignment = mongoose.model('ProductAssignment');
    await ProductAssignment.deleteMany({ doctor: this._id });
    next();
  } catch (error) {
    next(error);
  }
});

// Also handle findOneAndDelete and deleteMany via query middleware
doctorSchema.pre('findOneAndDelete', async function (next) {
  try {
    const doc = await this.model.findOne(this.getFilter());
    if (doc) {
      const ProductAssignment = mongoose.model('ProductAssignment');
      await ProductAssignment.deleteMany({ doctor: doc._id });
    }
    next();
  } catch (error) {
    next(error);
  }
});

const Doctor = mongoose.model('Doctor', doctorSchema);

module.exports = Doctor;
