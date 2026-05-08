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
    // BDM(s) assigned to visit this doctor.
    // Phase A.5.4 (May 2026) flipped this from scalar → array so multiple BDMs can
    // share one VIP Client (e.g. Jake + Romela both covering Dr. Sharon in Iloilo).
    // `primaryAssignee` below is the canonical "owner" used for ownership-style
    // operations (single-name display, default routing). Read via the helpers in
    // backend/utils/assigneeAccess.js (getAssigneeIds / isAssignedTo /
    // getPrimaryAssigneeId) — never the legacy `doctor.assignedTo?._id ||
    // doctor.assignedTo` ternary, which silently miscompares array shapes.
    assignedTo: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    // Phase A.5 (Apr 2026) — Primary ownership scalar. Always kept in sync with
    // `assignedTo[]` by the pre-save hook: must be one of the assignees, defaults
    // to the first if unset or stale. Used by surfaces that need ONE responsible
    // BDM (auto-reply send-as user, single-name display, rebate routing).
    primaryAssignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Phase E1 (May 2026) — Multi-tenant entity scoping for VIP Clients (SaaS-readiness).
    //
    // `entity_ids[]` is the union of every BDM-in-`assignedTo`'s effective working
    // set (`User.entity_ids` if present, falling back to `[User.entity_id]` for
    // legacy single-entity users). Auto-maintained by pre-save / pre-findOneAndUpdate
    // hooks below — DO NOT write directly from controllers; mutate `assignedTo` and
    // let the hook recompute. Admin entity-direct override is captured in Phase E2
    // (out of scope today: today there is no use case where a doctor's reachable
    // entities should diverge from its assignees' entities).
    //
    // Used by:
    //   * getAllDoctors `?entity_id=` filter (Rule #21 — privileged opt-in;
    //     non-privileged users always scoped to working entity by tenantFilter).
    //   * Rebate matrix referential-consistency check at create
    //     (rule.entity_id MUST be one of partner.entity_ids).
    //   * Year-2 SaaS spin-out tenant isolation (Rule #0d) — this is the canonical
    //     scope key once the multi-subscriber bundle ships.
    //
    // Empty array means "unassigned" (no BDM coverage). Admin can still see these
    // via cross-entity opt-in; BDMs do not see them under any condition.
    entity_ids: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Entity',
    }],
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
    // ── Phase VIP-1.A (Apr 2026) — MD Partner Lead Pipeline ────────────────────
    // Foundation for the MD-rebate moat (VIP-1.B). Discovery is automated via
    // storefront sync (VIP-1.D Rx OCR + customer attestation, future); conversion
    // is human (BDM in-person visits). Schema enums are the validation gate;
    // labels + colors come from DOCTOR_PARTNERSHIP_STATUS + DOCTOR_LEAD_SOURCE
    // lookups (Rule #3 — subscriber configures via Control Center).
    //
    // Pre-save default behavior:
    //   - new docs without partnership_status → LEAD (auto-discovered MD pipeline)
    //   - existing docs without partnership_status → PARTNER on next save
    //     (assumption: anyone in CRM pre-VIP-1.A is at least at VISITED stage)
    partnership_status: {
      type: String,
      enum: {
        values: ['LEAD', 'CONTACTED', 'VISITED', 'PARTNER', 'INACTIVE'],
        message: 'partnership_status must be LEAD, CONTACTED, VISITED, PARTNER, or INACTIVE',
      },
    },
    lead_source: {
      type: String,
      enum: {
        values: ['RX_PARSE', 'CUSTOMER_ATTESTATION', 'BDM_MANUAL', 'IMPORT', 'OTHER'],
        message: 'lead_source must be RX_PARSE, CUSTOMER_ATTESTATION, BDM_MANUAL, IMPORT, or OTHER',
      },
      default: 'BDM_MANUAL',
    },
    partner_agreement_date: { type: Date, default: null },
    prc_license_number: {
      type: String,
      trim: true,
      maxlength: [40, 'PRC license number cannot exceed 40 characters'],
    },
    partnership_notes: {
      type: String,
      maxlength: [2000, 'Partnership notes cannot exceed 2000 characters'],
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
// Phase A.5 (Apr 2026) — Canonical key lookup index. Today the index is plain
// (non-unique) so the A.5.2 migration script can flip it to a partial-unique
// shape AFTER admin merges duplicates through the A.5.5 admin merge tool.
//
// Final shape after A.5.2 flip (built by `migrateVipClientCanonical.js
// --add-unique-index`):
//   { vip_client_name_clean: 1 } UNIQUE with partialFilterExpression { mergedInto: null }
//
// Why partialFilterExpression instead of plain unique (vs Customer.js / Hospital.js):
//   The merge service (Phase A.5.5) soft-deletes losers by setting `isActive:false`
//   + `mergedInto: <winner>` but DOES NOT rename `vip_client_name_clean`. After a
//   merge, both winner and loser carry the same canonical key. A plain unique
//   index would refuse to build (and rollback would later collide). The partial
//   filter restricts uniqueness to live records (`mergedInto: null`), which
//   exactly matches the "no two ACTIVE doctors share a canonical name" invariant
//   that the merge tool's dry-run scope enforces.
doctorSchema.index({ vip_client_name_clean: 1 });
// Phase A.5 — merged-record lookup (cron hard-delete + rollback queries)
doctorSchema.index({ mergedInto: 1 });
doctorSchema.index({ mergedAt: 1 });
// Phase VIP-1.A — partnership pipeline hot path: MD Leads page filters by
// partnership_status; BDM-self pipeline filters by both assignedTo + status.
doctorSchema.index({ partnership_status: 1, isActive: 1 });
doctorSchema.index({ assignedTo: 1, partnership_status: 1, isActive: 1 });
// Phase E1 (May 2026) — entity scoping (SaaS-readiness).
// Plain index supports `find({ entity_ids: workingEntityId })` — the rebate
// picker hot path. The compound index covers the typical picker query
// (entity scope + active partners + hospital affiliation count gate).
doctorSchema.index({ entity_ids: 1 });
doctorSchema.index({ entity_ids: 1, partnership_status: 1, isActive: 1 });
// Sparse partial index — only documents that have a string PRC# get indexed.
// VIP-1.B may flip to unique after admin dedups duplicates via the merge tool.
doctorSchema.index(
  { prc_license_number: 1 },
  { partialFilterExpression: { prc_license_number: { $type: 'string' } } },
);
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

// Phase A.5.4 — `assigneeIds` virtual returns string IDs of every assignee, in
// canonical order (primary first if known). Use this for membership checks and
// rendering — never iterate `assignedTo` directly with the legacy
// `?._id || x.toString()` ternary, which silently mishandles arrays.
doctorSchema.virtual('assigneeIds').get(function () {
  const raw = this.assignedTo;
  if (!Array.isArray(raw) || raw.length === 0) {
    // Defensive: tolerate a not-yet-migrated legacy scalar so reads don't fail
    if (raw && !Array.isArray(raw)) {
      const single = raw._id ? raw._id.toString() : raw.toString();
      return single ? [single] : [];
    }
    return [];
  }
  const ids = raw.map((u) => (u && u._id ? u._id.toString() : (u ? u.toString() : null))).filter(Boolean);
  // Reorder so primaryAssignee (if known + present) is first
  if (this.primaryAssignee) {
    const primaryId = this.primaryAssignee._id
      ? this.primaryAssignee._id.toString()
      : this.primaryAssignee.toString();
    const idx = ids.indexOf(primaryId);
    if (idx > 0) {
      ids.splice(idx, 1);
      ids.unshift(primaryId);
    }
  }
  return ids;
});

// Virtual: Get assigned products (populated via ProductAssignment)
doctorSchema.virtual('assignedProducts', {
  ref: 'ProductAssignment',
  localField: '_id',
  foreignField: 'doctor',
  match: { status: 'active' },
});

// Static: Find doctors assigned to an employee.
// Phase A.5.4 — `{ assignedTo: employeeId }` works for both array and scalar
// shapes via Mongo's array-contains semantics, so this query is shape-agnostic.
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
// + Phase VIP-1.A (Apr 2026): default partnership_status — LEAD for new docs,
//   VISITED for legacy docs being saved without the field set (flipped Apr 29
//   from PARTNER to match the corrective migration; PARTNER status now
//   requires explicit admin promotion + partner_agreement_date). Runs before
//   the name-not-modified early-return so it triggers even on partnership-only
//   saves.
// Key shape: `lastname|firstname` (lowercased, inner whitespace collapsed).
// Mirrors Customer.customer_name_clean / Hospital.hospital_name_clean pattern.
doctorSchema.pre('save', async function (next) {
  // Phase VIP-1.A — partnership_status default.
  // Apr 29 2026: legacy fallback flipped from PARTNER → VISITED to match the
  // corrective migration (migrateLegacyPartnersToVisited.js). PARTNER status
  // requires admin promotion via /admin/md-leads + partner_agreement_date.
  if (this.partnership_status == null) {
    this.partnership_status = this.isNew ? 'LEAD' : 'VISITED';
  }

  // Phase A.5.4 — keep primaryAssignee in sync with assignedTo[].
  // Invariant: primaryAssignee, when set, MUST be one of assignedTo[]. If a
  // caller wrote a non-member into primaryAssignee (or assignedTo got reduced
  // and no longer contains the previous primary), we fall back to the first
  // assignee. If primaryAssignee is unset and assignedTo has at least one
  // element, default it to the first.
  if (Array.isArray(this.assignedTo) && this.assignedTo.length > 0) {
    const ids = this.assignedTo
      .map((u) => (u && u._id ? u._id.toString() : (u ? u.toString() : null)))
      .filter(Boolean);
    const primaryStr = this.primaryAssignee
      ? (this.primaryAssignee._id ? this.primaryAssignee._id.toString() : this.primaryAssignee.toString())
      : null;
    if (!primaryStr || !ids.includes(primaryStr)) {
      this.primaryAssignee = this.assignedTo[0]?._id || this.assignedTo[0];
    }
  } else if ((!this.assignedTo || (Array.isArray(this.assignedTo) && this.assignedTo.length === 0)) && this.primaryAssignee) {
    // No assignees → primary cannot exist either.
    this.primaryAssignee = null;
  }

  // Phase E1 — derive entity_ids from current assignees' effective working set.
  // Triggered when assignedTo was modified OR when entity_ids is empty/missing
  // on a doc that already has assignees (heals legacy rows on first save without
  // forcing a one-shot migration on every read). Reads live User docs to pick up
  // any FRA-driven entity additions; tolerant to assignees missing entity_ids
  // (legacy single-entity users) by falling back to entity_id.
  const assigneeIds = Array.isArray(this.assignedTo)
    ? this.assignedTo.map((u) => (u && u._id ? u._id : u)).filter(Boolean)
    : [];
  const entityIdsModified = this.isModified('entity_ids');
  const entityIdsEmpty = !Array.isArray(this.entity_ids) || this.entity_ids.length === 0;
  const shouldDeriveEntityIds = this.isModified('assignedTo') || (assigneeIds.length > 0 && entityIdsEmpty && !entityIdsModified);
  if (shouldDeriveEntityIds) {
    if (assigneeIds.length === 0) {
      this.entity_ids = [];
    } else {
      try {
        const User = mongoose.model('User');
        const users = await User.find({ _id: { $in: assigneeIds } })
          .select('entity_id entity_ids')
          .lean();
        const entitySet = new Set();
        for (const u of users) {
          if (Array.isArray(u.entity_ids) && u.entity_ids.length > 0) {
            for (const eid of u.entity_ids) entitySet.add(String(eid));
          } else if (u.entity_id) {
            entitySet.add(String(u.entity_id));
          }
        }
        this.entity_ids = Array.from(entitySet).map((s) => new mongoose.Types.ObjectId(s));
      } catch (err) {
        // Don't block the save on a User-fetch hiccup — leave entity_ids untouched
        // and let the periodic healthcheck flag the row. Hard-failing here would
        // back-pressure unrelated CRM writes whenever Mongo blips.
        // eslint-disable-next-line no-console
        console.warn(`[Doctor.pre-save] entity_ids derivation skipped for ${this._id}: ${err.message}`);
      }
    }
  }

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
//
// Phase E1 (May 2026) — also recompute entity_ids when assignedTo changes via any
// operator ($set / $addToSet / $pull). Mirrors the pre-save derivation: union of
// assignees' User.entity_ids (or [User.entity_id] fallback for legacy users).
// Without this, $addToSet on assignedTo (used by the join-coverage flow in
// messageInboxController) would silently leave entity_ids stale, hiding the
// doctor from the new entity's picker.
doctorSchema.pre('findOneAndUpdate', async function (next) {
  try {
    const update = this.getUpdate() || {};
    const $set = update.$set || {};
    const $addToSet = update.$addToSet || {};
    const $pull = update.$pull || {};

    // ── Canonical-name key (Phase A.5) ──────────────────────────────────────
    const firstName = $set.firstName !== undefined ? $set.firstName : update.firstName;
    const lastName = $set.lastName !== undefined ? $set.lastName : update.lastName;
    const nameInUpdate = firstName !== undefined || lastName !== undefined;

    // ── Entity scoping (Phase E1) ────────────────────────────────────────────
    const assignedToInSet = $set.assignedTo !== undefined || update.assignedTo !== undefined;
    const assignedToInAddToSet = $addToSet.assignedTo !== undefined;
    const assignedToInPull = $pull.assignedTo !== undefined;
    const assignedToTouched = assignedToInSet || assignedToInAddToSet || assignedToInPull;
    // Skip entity-derivation if caller is explicitly setting entity_ids (e.g.
    // backfill migration --apply path). The migration owns the field directly.
    const entityIdsExplicit = $set.entity_ids !== undefined || update.entity_ids !== undefined;

    if (!nameInUpdate && !assignedToTouched) return next();

    // Fetch the current doc only if we need it (name half-update or assignee
    // operator-update). Single read regardless of how many fields we recompute.
    const needsCurrentDoc = (nameInUpdate && (firstName === undefined || lastName === undefined))
      || (assignedToTouched && !assignedToInSet);
    const currentDoc = needsCurrentDoc
      ? await this.model.findOne(this.getFilter()).select('firstName lastName assignedTo').lean()
      : null;

    // Recompute canonical-name key.
    if (nameInUpdate) {
      const fn = firstName !== undefined ? firstName : currentDoc?.firstName;
      const ln = lastName !== undefined ? lastName : currentDoc?.lastName;
      const last = (ln || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const first = (fn || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const clean = `${last}|${first}`;
      if (update.$set) update.$set.vip_client_name_clean = clean;
      else update.vip_client_name_clean = clean;
    }

    // Recompute entity_ids.
    if (assignedToTouched && !entityIdsExplicit) {
      // Determine final assignee set after the operator applies.
      let finalAssignees;
      if (assignedToInSet) {
        const raw = $set.assignedTo !== undefined ? $set.assignedTo : update.assignedTo;
        finalAssignees = Array.isArray(raw) ? raw : (raw ? [raw] : []);
      } else {
        const existing = Array.isArray(currentDoc?.assignedTo) ? currentDoc.assignedTo : [];
        let next = existing.map((u) => (u && u._id ? u._id : u)).filter(Boolean).map(String);
        if (assignedToInAddToSet) {
          const raw = $addToSet.assignedTo;
          // Mongo allows scalar OR { $each: [...] }. Both produce additions.
          const adds = (raw && typeof raw === 'object' && Array.isArray(raw.$each))
            ? raw.$each
            : (Array.isArray(raw) ? raw : [raw]);
          for (const a of adds) {
            const s = a && a._id ? String(a._id) : String(a);
            if (s && !next.includes(s)) next.push(s);
          }
        }
        if (assignedToInPull) {
          const raw = $pull.assignedTo;
          const removes = Array.isArray(raw) ? raw.map(String)
            : (raw && typeof raw === 'object' && raw.$in)
              ? raw.$in.map(String)
              : [String(raw)];
          next = next.filter((s) => !removes.includes(s));
        }
        finalAssignees = next.map((s) => new mongoose.Types.ObjectId(s));
      }

      // Fetch the assignees' effective entity sets and union them.
      const assigneeIds = finalAssignees
        .map((u) => (u && u._id ? u._id : u))
        .filter(Boolean);
      let derived = [];
      if (assigneeIds.length > 0) {
        const User = mongoose.model('User');
        const users = await User.find({ _id: { $in: assigneeIds } })
          .select('entity_id entity_ids')
          .lean();
        const entitySet = new Set();
        for (const u of users) {
          if (Array.isArray(u.entity_ids) && u.entity_ids.length > 0) {
            for (const eid of u.entity_ids) entitySet.add(String(eid));
          } else if (u.entity_id) {
            entitySet.add(String(u.entity_id));
          }
        }
        derived = Array.from(entitySet).map((s) => new mongoose.Types.ObjectId(s));
      }

      if (update.$set) update.$set.entity_ids = derived;
      else update.entity_ids = derived;
    }

    next();
  } catch (err) {
    next(err);
  }
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
