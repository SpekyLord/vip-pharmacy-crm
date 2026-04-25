/**
 * Three-Way Match Service — Phase 12.3
 *
 * Compares PO line → GRN line → Supplier Invoice line.
 * Match by product_id or item_key; check qty and price within tolerance.
 * Updates invoice match_status and per-line flags.
 */
const SupplierInvoice = require('../models/SupplierInvoice');
const PurchaseOrder = require('../models/PurchaseOrder');
const GrnEntry = require('../models/GrnEntry');

/**
 * Run 3-way matching on a supplier invoice
 * @param {String} invoiceId
 * @param {Number} tolerancePct — price tolerance percentage (default 2%)
 * @returns {Object} { matched_lines[], discrepancy_lines[], unmatched_lines[], overall_status }
 */
async function matchInvoice(invoiceId, tolerancePct = 0.02) {
  // eslint-disable-next-line vip-tenant/require-entity-filter -- caller (purchasingController.runThreeWayMatch) pre-validates invoice's entity_id; this is a trusted internal service
  const invoice = await SupplierInvoice.findById(invoiceId);
  if (!invoice) throw new Error('Supplier invoice not found');

  // Load PO and GRN if linked; auto-discover PO from GRN when invoice has grn_id but no po_id
  // eslint-disable-next-line vip-tenant/require-entity-filter -- po_id sourced from caller-validated invoice; FK ref written by in-entity create flow
  let po = invoice.po_id ? await PurchaseOrder.findById(invoice.po_id).lean() : null;
  // eslint-disable-next-line vip-tenant/require-entity-filter -- grn_id sourced from caller-validated invoice; FK ref written by in-entity create flow
  const grn = invoice.grn_id ? await GrnEntry.findById(invoice.grn_id).lean() : null;
  if (!po && grn?.po_id) {
    // eslint-disable-next-line vip-tenant/require-entity-filter -- po_id sourced from in-entity grn fetched above
    po = await PurchaseOrder.findById(grn.po_id).lean();
  }

  // Build lookup maps — support duplicate product_id by summing qty and averaging price
  const poLineMap = new Map();
  if (po) {
    for (const line of po.line_items) {
      const key = line.product_id ? line.product_id.toString() : line.item_key;
      if (!key) continue;
      const existing = poLineMap.get(key);
      if (existing) {
        existing.qty_ordered += line.qty_ordered;
        // Weighted average unit price
        existing.unit_price = (existing.unit_price * (existing.qty_ordered - line.qty_ordered) + line.unit_price * line.qty_ordered) / existing.qty_ordered;
      } else {
        poLineMap.set(key, { qty_ordered: line.qty_ordered, unit_price: line.unit_price });
      }
    }
  }

  const grnLineMap = new Map();
  if (grn) {
    for (const line of grn.line_items) {
      const key = line.product_id ? line.product_id.toString() : null;
      if (!key) continue;
      const existing = grnLineMap.get(key) || { qty: 0 };
      existing.qty += line.qty;
      grnLineMap.set(key, existing);
    }
  }

  const matched_lines = [];
  const discrepancy_lines = [];
  const unmatched_lines = [];

  for (let i = 0; i < invoice.line_items.length; i++) {
    const invLine = invoice.line_items[i];
    const productKey = invLine.product_id ? invLine.product_id.toString() : null;
    const itemKey = invLine.item_key;

    // Try matching by product_id first, then by item_key
    const poLine = (productKey && poLineMap.get(productKey)) || (itemKey && poLineMap.get(itemKey)) || null;
    const grnLine = productKey ? grnLineMap.get(productKey) : null;

    let poMatch = false;
    let grnMatch = false;
    const discrepancies = [];

    // PO matching
    if (poLine) {
      // Qty check
      if (invLine.qty_invoiced === poLine.qty_ordered) {
        poMatch = true;
      } else {
        discrepancies.push(`PO qty: ordered=${poLine.qty_ordered}, invoiced=${invLine.qty_invoiced}`);
      }
      // Price check (within tolerance)
      if (poLine.unit_price > 0) {
        const priceDiff = Math.abs(invLine.unit_price - poLine.unit_price) / poLine.unit_price;
        if (priceDiff > tolerancePct) {
          poMatch = false;
          discrepancies.push(`Price: PO=${poLine.unit_price}, Invoice=${invLine.unit_price} (diff ${(priceDiff * 100).toFixed(1)}%)`);
        }
      }
    }

    // GRN matching
    if (grnLine) {
      if (invLine.qty_invoiced === grnLine.qty) {
        grnMatch = true;
      } else {
        discrepancies.push(`GRN qty: received=${grnLine.qty}, invoiced=${invLine.qty_invoiced}`);
      }
    }

    // Update per-line flags
    invoice.line_items[i].po_line_matched = poMatch;
    invoice.line_items[i].grn_line_matched = grnMatch;

    const lineResult = {
      index: i,
      product_id: invLine.product_id,
      item_key: invLine.item_key,
      qty_invoiced: invLine.qty_invoiced,
      unit_price: invLine.unit_price,
      po_matched: poMatch,
      grn_matched: grnMatch,
      discrepancies
    };

    if (poMatch && grnMatch) {
      matched_lines.push(lineResult);
    } else if (discrepancies.length > 0) {
      discrepancy_lines.push(lineResult);
    } else {
      unmatched_lines.push(lineResult);
    }
  }

  // Update PO qty_invoiced for matched AND discrepancy lines (ISSUE 8: track invoiced qty regardless of match quality)
  if (po) {
    // eslint-disable-next-line vip-tenant/require-entity-filter -- po_id sourced from caller-validated invoice (same id as L23 read); writeable handle
    const poDoc = await PurchaseOrder.findById(invoice.po_id);
    if (poDoc) {
      const invoicedLines = [...matched_lines, ...discrepancy_lines];
      for (const il of invoicedLines) {
        const key = il.product_id ? il.product_id.toString() : null;
        const poLine = poDoc.line_items.find(l =>
          (key && l.product_id?.toString() === key) || (il.item_key && l.item_key === il.item_key)
        );
        if (poLine) {
          poLine.qty_invoiced = Math.max(poLine.qty_invoiced || 0, il.qty_invoiced);
        }
      }
      await poDoc.save();
    }
  }

  // Determine overall status
  let overall_status;
  if (discrepancy_lines.length > 0) {
    overall_status = 'DISCREPANCY';
  } else if (unmatched_lines.length > 0 && matched_lines.length > 0) {
    overall_status = 'PARTIAL_MATCH';
  } else if (matched_lines.length === invoice.line_items.length) {
    overall_status = 'FULL_MATCH';
  } else if (unmatched_lines.length === invoice.line_items.length) {
    overall_status = 'UNMATCHED';
  } else {
    overall_status = 'PARTIAL_MATCH';
  }

  invoice.match_status = overall_status;
  await invoice.save();

  return { matched_lines, discrepancy_lines, unmatched_lines, overall_status };
}

module.exports = { matchInvoice };
