/**
 * COA Code Validation Utility
 *
 * Validates that a coa_code exists in ChartOfAccounts for the given entity.
 * Used by VendorMaster, BankAccount, CreditCard, PaymentMode controllers
 * to prevent references to non-existent account codes.
 */
const ChartOfAccounts = require('../models/ChartOfAccounts');

/**
 * Validate a single COA code against ChartOfAccounts.
 * @param {string} coaCode - The account code to validate
 * @param {ObjectId} entityId - The entity_id to scope the lookup
 * @returns {Promise<{valid: boolean, message?: string}>}
 */
async function validateCoaCode(coaCode, entityId) {
  if (!coaCode) return { valid: true }; // no code to validate
  if (!entityId) return { valid: true }; // can't validate without entity

  const exists = await ChartOfAccounts.findOne({
    entity_id: entityId,
    account_code: coaCode.trim(),
    is_active: true
  }).select('_id').lean();

  if (!exists) {
    return { valid: false, message: `COA code "${coaCode}" does not exist in Chart of Accounts` };
  }
  return { valid: true };
}

module.exports = { validateCoaCode };
