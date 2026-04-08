/**
 * BIR Filing Review Agent (#5) - AI-powered compliance check before BIR filing.
 */

const { askClaude } = require('./claudeClient');
const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');

async function run() {
  console.log('[BirFiling] Running...');

  const JournalEntry = require('../erp/models/JournalEntry');
  const ExpenseEntry = require('../erp/models/ExpenseEntry');
  const Entity = require('../erp/models/Entity');

  const now = new Date();
  const reviewMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const reviewYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const period = `${reviewYear}-${String(reviewMonth).padStart(2, '0')}`;

  const entities = await Entity.find({ is_active: true }).lean();
  if (!entities.length) {
    return {
      status: 'success',
      summary: {
        bdms_processed: 0,
        alerts_generated: 0,
        messages_sent: 0,
        key_findings: [`No active entities found for BIR review of ${period}.`],
      },
      message_ids: [],
    };
  }

  const notificationResults = [];
  const keyFindings = [];
  let entitiesReviewed = 0;

  for (const entity of entities) {
    const jes = await JournalEntry.find({
      entity_id: entity._id,
      period,
      status: 'POSTED',
      is_reversal: { $ne: true },
    }).select('description lines bir_flag vat_flag source_module source_doc_ref').lean();

    if (!jes.length) continue;

    const birOnly = jes.filter((journal) => journal.bir_flag === 'BIR');
    const internalOnly = jes.filter((journal) => journal.bir_flag === 'INTERNAL');
    const both = jes.filter((journal) => journal.bir_flag === 'BOTH' || !journal.bir_flag);

    let totalVatIn = 0;
    let totalVatOut = 0;
    let totalCwt = 0;
    for (const journal of jes) {
      for (const line of journal.lines || []) {
        if (line.account_code === '1200') totalVatIn += line.debit || 0;
        if (line.account_code === '2100') totalVatOut += line.credit || 0;
        if (line.account_code === '1220') totalCwt += line.debit || 0;
      }
    }

    const expenses = await ExpenseEntry.find({
      entity_id: entity._id,
      period,
      status: 'POSTED',
    }).select('lines total_amount total_vat bir_flag').lean();

    const expenseCount = expenses.length;
    const noOrCount = expenses.reduce((count, expense) => count + expense.lines.filter((line) => !line.or_number && !line.or_photo_url).length, 0);
    const miscCount = expenses.reduce((count, expense) => count + expense.lines.filter((line) => line.coa_code === '6900').length, 0);

    const summary = `Period: ${period}
Entity: ${entity.entity_name}
Total JEs: ${jes.length} (BIR: ${birOnly.length}, Internal: ${internalOnly.length}, Both: ${both.length})
VAT Input: PHP ${totalVatIn.toLocaleString()} | VAT Output: PHP ${totalVatOut.toLocaleString()} | Net: PHP ${(totalVatOut - totalVatIn).toLocaleString()}
CWT Receivable: PHP ${totalCwt.toLocaleString()}
Expenses: ${expenseCount} entries | Lines without OR proof: ${noOrCount} | Miscellaneous (6900): ${miscCount}`;

    const { text } = await askClaude({
      system: `You are a Philippine tax compliance reviewer for a pharma distributor. Review the monthly financial summary and flag:
1. VAT discrepancies
2. Missing OR documentation
3. Misclassified expenses
4. BIR flag inconsistencies
5. CWT filing reminders
Be specific and actionable.`,
      prompt: `Review this month's data for BIR compliance issues:\n\n${summary}\n\nProvide a compliance checklist with any flagged issues.`,
      maxTokens: 600,
      agent: 'bir_filing',
    });

    notificationResults.push(
      ...(await notify({
        recipient_id: 'PRESIDENT',
        title: `BIR Filing Review - ${period} (${entity.entity_name})`,
        body: text,
        category: 'ai_alert',
        priority: 'important',
        channels: ['in_app'],
        agent: 'bir_filing',
      }))
    );

    notificationResults.push(
      ...(await notify({
        recipient_id: 'ALL_ADMINS',
        title: `BIR Filing Review - ${period}`,
        body: text,
        category: 'ai_alert',
        priority: 'important',
        channels: ['in_app'],
        agent: 'bir_filing',
      }))
    );

    entitiesReviewed += 1;
    keyFindings.push(`${entity.entity_name}: ${jes.length} JEs reviewed, ${expenseCount} expense entries checked`);
    console.log(`[BirFiling] ${entity.entity_name}: ${period} reviewed - ${jes.length} JEs, ${expenseCount} expenses`);
  }

  if (!entitiesReviewed) {
    return {
      status: 'success',
      summary: {
        bdms_processed: 0,
        alerts_generated: 0,
        messages_sent: 0,
        key_findings: [`No posted journal entries found for BIR review period ${period}.`],
      },
      message_ids: [],
    };
  }

  console.log('[BirFiling] Done.');

  return {
    status: 'success',
    summary: {
      bdms_processed: entitiesReviewed,
      alerts_generated: entitiesReviewed,
      messages_sent: countSuccessfulChannels(notificationResults, 'in_app'),
      key_findings: keyFindings.slice(0, 5),
    },
    message_ids: getInAppMessageIds(notificationResults),
  };
}

module.exports = { run };
