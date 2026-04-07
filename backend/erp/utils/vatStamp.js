/**
 * VAT Rate Stamp Utility
 *
 * Stamps _vat_rate on a Mongoose document before save so pre-save hooks
 * can use it instead of hardcoded 0.12.
 *
 * Uses Settings.getVatRate() which caches for 5 minutes.
 *
 * Usage in controllers:
 *   const { stampVat } = require('../utils/vatStamp');
 *   await stampVat(doc);
 *   await doc.save();
 */
const Settings = require('../models/Settings');

async function stampVat(doc) {
  if (!doc) return;
  doc._vat_rate = await Settings.getVatRate();
}

async function stampVatMany(docs) {
  if (!docs?.length) return;
  const rate = await Settings.getVatRate();
  for (const doc of docs) {
    doc._vat_rate = rate;
  }
}

module.exports = { stampVat, stampVatMany };
