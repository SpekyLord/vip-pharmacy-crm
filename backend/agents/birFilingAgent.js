/**
 * BIR Filing Review Agent (#5) — AI-powered compliance check before BIR filing
 *
 * Runs 15th of each month at 9:00 AM.
 * Reviews the previous month's journal entries, VAT/CWT ledger, and expense
 * classifications for compliance gaps before the BIR filing deadline.
 *
 * Notifies: PRESIDENT + finance users
 */
const { askClaude } = require('./claudeClient');
const { notify } = require('./notificationService');

async function run() {
  console.log('[BirFiling] Running...');
  try {
    const JournalEntry = require('../erp/models/JournalEntry');
    const ExpenseEntry = require('../erp/models/ExpenseEntry');
    const Entity = require('../erp/models/Entity');

    const now = new Date();
    // Review previous month
    const reviewMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const reviewYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const period = `${reviewYear}-${String(reviewMonth).padStart(2, '0')}`;

    const entities = await Entity.find({ is_active: true }).lean();

    for (const entity of entities) {
      const entityId = entity._id;

      // Get all posted JEs for the period
      const jes = await JournalEntry.find({
        entity_id: entityId,
        period,
        status: 'POSTED',
        is_reversal: { $ne: true }
      }).select('description lines bir_flag vat_flag source_module source_doc_ref').lean();

      if (!jes.length) continue;

      // Summarize by BIR flag
      const birOnly = jes.filter(j => j.bir_flag === 'BIR');
      const internalOnly = jes.filter(j => j.bir_flag === 'INTERNAL');
      const both = jes.filter(j => j.bir_flag === 'BOTH' || !j.bir_flag);

      // VAT summary
      let totalVatIn = 0, totalVatOut = 0, totalCwt = 0;
      for (const je of jes) {
        for (const line of je.lines || []) {
          if (line.account_code === '1200') totalVatIn += line.debit || 0;  // Input VAT
          if (line.account_code === '2100') totalVatOut += line.credit || 0; // Output VAT
          if (line.account_code === '1220') totalCwt += line.debit || 0;    // CWT receivable
        }
      }

      // Get expenses with potential issues
      const expenses = await ExpenseEntry.find({
        entity_id: entityId,
        period,
        status: 'POSTED'
      }).select('lines total_amount total_vat bir_flag').lean();

      const expenseCount = expenses.length;
      const noOrCount = expenses.reduce((c, e) => c + e.lines.filter(l => !l.or_number && !l.or_photo_url).length, 0);
      const miscCount = expenses.reduce((c, e) => c + e.lines.filter(l => l.coa_code === '6900').length, 0);

      const summary = `Period: ${period}
Entity: ${entity.entity_name}
Total JEs: ${jes.length} (BIR: ${birOnly.length}, Internal: ${internalOnly.length}, Both: ${both.length})
VAT Input: ₱${totalVatIn.toLocaleString()} | VAT Output: ₱${totalVatOut.toLocaleString()} | Net: ₱${(totalVatOut - totalVatIn).toLocaleString()}
CWT Receivable: ₱${totalCwt.toLocaleString()}
Expenses: ${expenseCount} entries | Lines without OR proof: ${noOrCount} | Miscellaneous (6900): ${miscCount}`;

      const { text } = await askClaude({
        system: `You are a Philippine tax compliance reviewer for a pharma distributor. Review the month's financial summary and flag:
1. VAT discrepancies (input vs output VAT imbalance)
2. Missing OR documentation (BIR requires receipts)
3. Misclassified expenses (too many in Miscellaneous 6900)
4. BIR flag inconsistencies
5. CWT filing reminders
Be specific and actionable. Philippine BIR context (2307, 2550M/Q, 1601-C, etc.).`,
        prompt: `Review this month's data for BIR compliance issues:\n\n${summary}\n\nProvide a compliance checklist with any flagged issues.`,
        maxTokens: 600,
        agent: 'bir_filing'
      });

      await notify({
        recipient_id: 'PRESIDENT',
        title: `BIR Filing Review — ${period} (${entity.entity_name})`,
        body: text,
        category: 'compliance_alert',
        priority: 'important',
        channels: ['in_app', 'email'],
        agent: 'bir_filing'
      });

      // Also notify finance users
      await notify({
        recipient_id: 'ALL_ADMINS',
        title: `BIR Filing Review — ${period}`,
        body: text,
        category: 'compliance_alert',
        priority: 'important',
        channels: ['in_app'],
        agent: 'bir_filing'
      });

      console.log(`[BirFiling] ${entity.entity_name}: ${period} reviewed — ${jes.length} JEs, ${expenseCount} expenses`);
    }

    console.log('[BirFiling] Done.');
  } catch (err) {
    console.error('[BirFiling] Error:', err.message);
  }
}

module.exports = { run };
