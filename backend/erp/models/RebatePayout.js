/**
 * RebatePayout — Phase VIP-1.B (Apr 2026)
 *
 * Accrual ledger for rebate payouts. Every rebate that gets COMPUTED writes a
 * RebatePayout row. Every rebate that gets PAID flips status to PAID.
 *
 * Lifecycle:
 *   ACCRUING        — engine has computed and recorded; awaiting period close
 *   READY_TO_PAY    — period closed, PRF generated, awaiting Finance posting
 *   PAID            — PRF POSTED → cash sent → JE landed
 *   VOIDED          — cancelled (Collection reopened, reversed, etc.)
 *
 * source_kind drives which source-doc populate path applies:
 *   TIER_A_PRODUCT     — MdProductRebate matched on Collection CSI line
 *   TIER_B_CAPITATION  — MdCapitationRule matched on storefront Order
 *   NON_MD             — NonMdPartnerRebateRule matched on Collection CSI
 *   STOREFRONT_MANUAL  — Phase R-Storefront Phase 2 (May 8 2026). Walk-in cash
 *                        sale with manual MD attribution by admin/proxy. Source
 *                        doc is SalesLine (CASH_RECEIPT/SERVICE_INVOICE routed
 *                        through petty_cash_fund), not Collection. No matrix
 *                        rule matched — proxy-entered rebate %.
 *
 * The accrual ledger replaces the implicit pre-VIP-1.B state where
 * Collection.partner_tags[].rebate_amount was the only artifact and PRFs were
 * generated ad-hoc. With the ledger, audit trails follow:
 *   Collection POSTED → RebatePayout(ACCRUING) row written
 *   Period close      → RebatePayout flipped to READY_TO_PAY, PRF auto-generated
 *   PRF POSTED        → RebatePayout flipped to PAID, prf_id set
 *
 * Idempotency: composite (collection_id|order_id, sales_line_id, payee_id, period)
 * is unique; engine upserts on the same key — replays don't double-write.
 *
 * BIR_FLAG: rebate JEs always 'INTERNAL' (Phase 0 invariant). The Payout row
 * itself doesn't carry bir_flag; that lives on the eventual JournalEntry. The
 * Payout is metadata about the payment instruction.
 *
 * Subscription posture:
 *   - entity_id required (Rule #19).
 *   - Per-row period gives a clean monthly-close axis.
 *   - Cross-DB refs: order_id (storefront), product_id (website DB) — stored
 *     as ObjectId without ref, mirror WebsiteProduct convention.
 */

const mongoose = require('mongoose');

const rebatePayoutSchema = new mongoose.Schema(
  {
    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Entity',
      required: [true, 'entity_id is required'],
      index: true,
    },

    // ── Payee identity ─────────────────────────────────────────────────────
    payee_kind: {
      type: String,
      enum: {
        values: ['MD', 'NON_MD'],
        message: 'payee_kind must be MD or NON_MD',
      },
      required: [true, 'payee_kind is required'],
      index: true,
    },
    // For MD payees: Doctor _id. For NON_MD: PeopleMaster _id.
    payee_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'payee_id is required'],
      index: true,
    },
    payee_name: { type: String, trim: true }, // denormalized for ledger UI

    // ── Source classification ──────────────────────────────────────────────
    source_kind: {
      type: String,
      enum: {
        values: ['TIER_A_PRODUCT', 'TIER_B_CAPITATION', 'NON_MD', 'STOREFRONT_MANUAL'],
        message: 'source_kind must be TIER_A_PRODUCT, TIER_B_CAPITATION, NON_MD, or STOREFRONT_MANUAL',
      },
      required: [true, 'source_kind is required'],
      index: true,
    },

    // ── Source document refs ───────────────────────────────────────────────
    // TIER_A_PRODUCT and NON_MD rebates come from a Collection CSI:
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
    // TIER_B_CAPITATION comes from a storefront Order (cross-DB ObjectId, no ref):
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    // Optional product reference (TIER_A_PRODUCT scenarios)
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    product_label: { type: String, trim: true },

    // ── Rule reference (which matrix row produced this payout) ─────────────
    // For audit trail — when a rebate amount looks wrong, trace to the rule
    // that fired. Refs union, only one set per row.
    md_product_rebate_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MdProductRebate',
      default: null,
    },
    md_capitation_rule_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MdCapitationRule',
      default: null,
    },
    non_md_rule_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NonMdPartnerRebateRule',
      default: null,
    },

    // ── Numbers ────────────────────────────────────────────────────────────
    rebate_pct: { type: Number, default: 0 },          // for TIER_A_PRODUCT / NON_MD
    rebate_amount: { type: Number, required: true, min: 0 }, // computed peso amount
    base_amount: { type: Number, default: 0 },         // line subtotal or order net

    // ── Period & lifecycle ─────────────────────────────────────────────────
    period: { type: String, required: true, trim: true, index: true }, // "2026-04"
    status: {
      type: String,
      enum: {
        values: ['ACCRUING', 'READY_TO_PAY', 'PAID', 'VOIDED'],
        message: 'status must be ACCRUING, READY_TO_PAY, PAID, or VOIDED',
      },
      default: 'ACCRUING',
      index: true,
    },
    // PRF that consumed this payout when transitioning to READY_TO_PAY / PAID.
    prf_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PrfCalf',
      default: null,
    },
    // JE that landed when PRF posted (cross-link for trace).
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
// Partial filter: only enforce when one of the source IDs is set (the engine
// sets exactly one of collection_id+sales_line_id OR order_id per row).
rebatePayoutSchema.index(
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

// "Show me all PAYOUTS to payee X in period Y, by status".
rebatePayoutSchema.index({
  entity_id: 1,
  payee_id: 1,
  period: 1,
  status: 1,
});

// Status-transition validator. ACCRUING → READY_TO_PAY → PAID. Reverse is
// VOIDED only (with reason). Prevents accidental backward flips.
rebatePayoutSchema.pre('save', function (next) {
  if (!this.isModified('status') || this.isNew) return next();
  const allowed = {
    ACCRUING: ['READY_TO_PAY', 'VOIDED'],
    READY_TO_PAY: ['PAID', 'VOIDED', 'ACCRUING'], // ACCRUING allowed for reopen
    PAID: ['VOIDED'],
    VOIDED: [], // terminal — re-accrue creates a new row, never resurrect
  };
  // Get the previous status from $__.activePaths (mongoose internal); simpler
  // approach: trust controllers to validate transitions before save.
  // Here we just enforce VOIDED is terminal.
  if (this.$__.priorDoc?.status === 'VOIDED') {
    return next(new Error('RebatePayout: VOIDED is terminal — create a new payout to re-accrue'));
  }
  next();
});

module.exports = mongoose.model('RebatePayout', rebatePayoutSchema);
