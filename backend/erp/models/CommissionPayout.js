/**
 * CommissionPayout — Phase VIP-1.B (Apr 2026)
 *
 * Sister of RebatePayout for staff commissions. Same lifecycle / status
 * machine; different source classification.
 *
 * Lifecycle: ACCRUING → READY_TO_PAY → PAID (or VOIDED).
 *
 * source_kind:
 *   ERP_COLLECTION         — BDM commission from Collection CSI (existing flow)
 *   STOREFRONT_ECOMM       — ECOMM_REP commission from storefront Order.paid
 *   STOREFRONT_AREA_BDM    — AREA_BDM commission from storefront Order, resolved
 *                            by Order.shipping_address.province ↔ Territory
 *
 * BIR_FLAG semantics (CRITICAL distinction from RebatePayout):
 *   Commissions ARE BIR-deductible expense (employee/contractor compensation).
 *   The eventual JE that lands when the commission is paid out via payroll
 *   (or via PRF for ECOMM_REP/AREA_BDM independent payees) MUST stamp
 *   bir_flag: 'BOTH'. The engine in Phase 2 handles this; the Payout row
 *   itself doesn't carry bir_flag — it's metadata about the accrual.
 *
 * Subscription posture:
 *   - entity_id required (Rule #19).
 *   - Per-row period gives a clean monthly-close axis.
 *   - Payee role drives downstream payout path:
 *       BDM        → folded into next payroll run (existing flow)
 *       ECOMM_REP  → independent PRF (or payroll if employee classification)
 *       AREA_BDM   → independent PRF or payroll, depending on employment_type
 */

const mongoose = require('mongoose');

const commissionPayoutSchema = new mongoose.Schema(
  {
    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Entity',
      required: [true, 'entity_id is required'],
      index: true,
    },

    // ── Payee identity ─────────────────────────────────────────────────────
    payee_role: {
      type: String,
      enum: {
        values: ['BDM', 'ECOMM_REP', 'AREA_BDM'],
        message: 'payee_role must be BDM, ECOMM_REP, or AREA_BDM',
      },
      required: [true, 'payee_role is required'],
      index: true,
    },
    payee_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'payee_id is required'],
      index: true,
    },
    payee_name: { type: String, trim: true },

    // ── Source classification ──────────────────────────────────────────────
    source_kind: {
      type: String,
      enum: {
        values: ['ERP_COLLECTION', 'STOREFRONT_ECOMM', 'STOREFRONT_AREA_BDM'],
        message: 'source_kind must be ERP_COLLECTION, STOREFRONT_ECOMM, or STOREFRONT_AREA_BDM',
      },
      required: [true, 'source_kind is required'],
      index: true,
    },

    // ── Source document refs ───────────────────────────────────────────────
    // ERP_COLLECTION: collection_id + sales_line_id
    collection_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Collection',
      default: null,
    },
    sales_line_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalesLine',
      default: null,
    },
    // STOREFRONT_*: order_id (cross-DB ObjectId, no ref)
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    territory_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Territory',
      default: null,
    },

    // ── Rule reference (audit trail) ───────────────────────────────────────
    // Either staff_commission_rule_id (matched a matrix row) or comp_profile_id
    // (BDM fallback to CompProfile.commission_rate when no rule matched).
    staff_commission_rule_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StaffCommissionRule',
      default: null,
    },
    comp_profile_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CompProfile',
      default: null,
    },

    // ── Numbers ────────────────────────────────────────────────────────────
    commission_pct: { type: Number, default: 0 },
    commission_amount: { type: Number, required: true, min: 0 },
    base_amount: { type: Number, default: 0 },

    // ── Period & lifecycle ─────────────────────────────────────────────────
    period: { type: String, required: true, trim: true, index: true },
    status: {
      type: String,
      enum: {
        values: ['ACCRUING', 'READY_TO_PAY', 'PAID', 'VOIDED'],
        message: 'status must be ACCRUING, READY_TO_PAY, PAID, or VOIDED',
      },
      default: 'ACCRUING',
      index: true,
    },
    // BDM commissions roll up into a payroll run; ECOMM_REP / AREA_BDM may
    // generate independent PRFs. Optional refs union.
    payroll_run_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PayrollRun',
      default: null,
    },
    prf_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PrfCalf',
      default: null,
    },
    journal_entry_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JournalEntry',
      default: null,
    },
    paid_at: { type: Date, default: null },

    // ── Audit ──────────────────────────────────────────────────────────────
    void_reason: { type: String, trim: true, default: '' },
    voided_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    voided_at: { type: Date, default: null },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

// Idempotency: same (collection|order, line, payee, period) cannot accrue twice.
commissionPayoutSchema.index(
  {
    entity_id: 1,
    payee_id: 1,
    period: 1,
    collection_id: 1,
    sales_line_id: 1,
    order_id: 1,
    source_kind: 1,
  },
  {
    unique: true,
    partialFilterExpression: { status: { $ne: 'VOIDED' } },
  }
);

// "Show me all COMMISSIONS to payee X in period Y, by status".
commissionPayoutSchema.index({
  entity_id: 1,
  payee_id: 1,
  period: 1,
  status: 1,
});

commissionPayoutSchema.pre('save', function (next) {
  if (!this.isModified('status') || this.isNew) return next();
  if (this.$__.priorDoc?.status === 'VOIDED') {
    return next(
      new Error('CommissionPayout: VOIDED is terminal — create a new payout to re-accrue')
    );
  }
  next();
});

module.exports = mongoose.model('CommissionPayout', commissionPayoutSchema);
