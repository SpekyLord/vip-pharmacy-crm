/**
 * Undertaking Service — Phase 32R (Apr 20, 2026)
 *
 * The Undertaking is a read-only acknowledgement wrapper auto-created
 * alongside every GRN. Mirrors CALF→Expense direction: GRN is the
 * capture surface (batch, expiry, qty, waybill — validated in createGrn),
 * Undertaking is the approval wrapper BDM submits and approver acknowledges.
 *
 * Module exports:
 *   - autoUndertakingForGrn: copy GRN → DRAFT Undertaking (atomic with GRN create)
 *   - getGrnSetting:         per-entity numeric GRN_SETTINGS lookup (MIN_EXPIRY_DAYS,
 *                            VARIANCE_TOLERANCE_PCT, WAYBILL_REQUIRED). Legacy
 *                            UNDERTAKING_SETTINGS lookup is consulted as fallback
 *                            so Phase 32 deploys that never rename continue to work.
 *   - computeLineVariance:   pure helper — flags QTY_UNDER/QTY_OVER/NEAR_EXPIRY
 *                            from expected/received/expiry using lookup thresholds.
 *
 * Gone from Phase 32 (see project_phase_32_undertaking_apr2026.md):
 *   - syncUndertakingToGrn — the Undertaking no longer overwrites GRN; GRN is the
 *     source of truth so there is nothing to sync back.
 *   - validateUndertaking / validateUndertakingLine — validation now runs in
 *     inventoryController.createGrn (capture time), not at UT submit.
 */
const Undertaking = require('../models/Undertaking');
const GrnEntry = require('../models/GrnEntry');
const Lookup = require('../models/Lookup');

const DEFAULT_MIN_EXPIRY_DAYS = 30;
const DEFAULT_VARIANCE_TOLERANCE_PCT = 10;

/**
 * Read a numeric setting from the GRN_SETTINGS lookup category (with
 * UNDERTAKING_SETTINGS as a compat fallback for deploys that haven't run the
 * rename migration yet).
 *
 * Per-entity configurable; falls back to the passed default on miss.
 * Subscription-ready: subscribers tune their own thresholds in Control Center.
 */
async function getGrnSetting(entityId, code, fallback) {
  if (!entityId) return fallback;
  const categories = ['GRN_SETTINGS', 'UNDERTAKING_SETTINGS']; // legacy fallback
  try {
    const entry = await Lookup.findOne({
      entity_id: entityId,
      category: { $in: categories },
      code,
      is_active: true
    }).lean();
    const value = entry?.metadata?.value;
    if (value === undefined || value === null) return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  } catch (err) {
    console.error(`[undertakingService] getGrnSetting failed for ${code}:`, err.message);
    return fallback;
  }
}

/**
 * Auto-create a DRAFT Undertaking alongside a newly-created GRN.
 * Called from inventoryController.createGrn within a MongoDB session
 * so both docs roll back together (global rule #20).
 *
 * Phase 32R: the Undertaking is a pure mirror of GRN capture data.
 * Batch/lot, expiry, received qty, and waybill already live on the GRN —
 * the Undertaking mirrors line fields so the Approval Hub can render
 * a self-contained card without joining, but the GRN is the source.
 *
 * @param {Object} grn - the just-created GrnEntry document
 * @param {Object} [opts]
 * @param {mongoose.ClientSession} [opts.session]
 * @returns {Promise<Object>} the created Undertaking
 */
async function autoUndertakingForGrn(grn, { session } = {}) {
  if (!grn) throw new Error('autoUndertakingForGrn: grn is required');
  if (!grn._id) throw new Error('autoUndertakingForGrn: grn must be persisted first');

  const varianceTolerancePct = await getGrnSetting(
    grn.entity_id, 'VARIANCE_TOLERANCE_PCT', DEFAULT_VARIANCE_TOLERANCE_PCT
  );

  const lineItems = (grn.line_items || []).map(li => {
    const expected = Number(li.expected_qty != null ? li.expected_qty : li.qty) || 0;
    const received = Number(li.qty) || 0;
    const variance_flag = computeLineVariance({
      expected_qty: expected,
      received_qty: received,
      expiry_date: li.expiry_date,
      variance_tolerance_pct: varianceTolerancePct
    });
    return {
      product_id: li.product_id,
      item_key: li.item_key,
      po_line_index: li.po_line_index,
      expected_qty: expected,
      received_qty: received,
      batch_lot_no: li.batch_lot_no || '',
      expiry_date: li.expiry_date || null,
      purchase_uom: li.purchase_uom,
      selling_uom: li.selling_uom,
      conversion_factor: li.conversion_factor || 1,
      qty_selling_units: received * (li.conversion_factor || 1),
      scan_confirmed: !!li.scan_confirmed,
      variance_flag
    };
  });

  const undertakingData = {
    entity_id: grn.entity_id,
    bdm_id: grn.bdm_id,
    warehouse_id: grn.warehouse_id,
    linked_grn_id: grn._id,
    receipt_date: grn.grn_date,
    waybill_photo_url: grn.waybill_photo_url || null,
    line_items: lineItems,
    status: 'DRAFT', // BDM reviews + submits from UT page
    created_by: grn.created_by || grn.bdm_id,
    // Phase G4.5b — mirror proxy flag so the UT inherits ownership metadata.
    // Without this, a proxied GRN would surface a "Proxied" pill on the GRN
    // list but the UT in the owner BDM's queue would look self-created.
    ...(grn.recorded_on_behalf_of ? { recorded_on_behalf_of: grn.recorded_on_behalf_of } : {})
  };

  // Mongoose .create() accepts session via array form
  const [undertaking] = await Undertaking.create([undertakingData], { session });

  // Back-link on GRN
  await GrnEntry.updateOne(
    { _id: grn._id },
    { $set: { undertaking_id: undertaking._id } },
    { session }
  );

  return undertaking;
}

/**
 * Pure helper — flag QTY_UNDER / QTY_OVER / NEAR_EXPIRY given a line's
 * expected/received/expiry and a variance tolerance percentage. Consumed by
 * autoUndertakingForGrn (at UT create) and can be reused by other surfaces
 * (Approval Hub recomputes on render for live badges).
 */
function computeLineVariance({ expected_qty, received_qty, expiry_date, variance_tolerance_pct } = {}) {
  // Expiry near-floor: < 90 days — advisory, already blocked-at-create by MIN_EXPIRY_DAYS.
  if (expiry_date) {
    const exp = new Date(expiry_date);
    if (!isNaN(exp.getTime())) {
      const ninetyDays = 90 * 24 * 60 * 60 * 1000;
      if ((exp - new Date()) < ninetyDays) return 'NEAR_EXPIRY';
    }
  }
  const exp = Number(expected_qty) || 0;
  const rec = Number(received_qty) || 0;
  const tol = Number(variance_tolerance_pct) || DEFAULT_VARIANCE_TOLERANCE_PCT;
  if (exp > 0 && rec > 0) {
    const diffPct = Math.abs(rec - exp) / exp * 100;
    if (diffPct > tol) return rec < exp ? 'QTY_UNDER' : 'QTY_OVER';
  }
  return null;
}

module.exports = {
  autoUndertakingForGrn,
  computeLineVariance,
  getGrnSetting,
  // Back-compat alias — callers that imported `getUndertakingSetting` still resolve.
  getUndertakingSetting: getGrnSetting,
  DEFAULT_MIN_EXPIRY_DAYS,
  DEFAULT_VARIANCE_TOLERANCE_PCT
};
