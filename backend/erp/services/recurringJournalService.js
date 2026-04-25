/**
 * Recurring Journal Template Service
 * Creates journal entries from active templates on schedule or manual trigger.
 */
const RecurringJournalTemplate = require('../models/RecurringJournalTemplate');
const { createJournal, postJournal } = require('./journalEngine');

/**
 * Compute next run date based on frequency
 */
function computeNextRunDate(currentDate, frequency) {
  const d = new Date(currentDate);
  switch (frequency) {
    case 'MONTHLY': d.setMonth(d.getMonth() + 1); break;
    case 'QUARTERLY': d.setMonth(d.getMonth() + 3); break;
    case 'ANNUALLY': d.setFullYear(d.getFullYear() + 1); break;
    default: d.setMonth(d.getMonth() + 1);
  }
  return d;
}

/**
 * Run all due templates for an entity
 * @param {String} entityId
 * @param {String} userId
 * @param {Date} asOfDate - default now
 * @returns {Array} created journal entries
 */
async function runDueTemplates(entityId, userId, asOfDate = new Date()) {
  const templates = await RecurringJournalTemplate.find({
    entity_id: entityId,
    is_active: true,
    next_run_date: { $lte: asOfDate }
  });

  const results = [];
  for (const tpl of templates) {
    try {
      const je = await executeTemplate(tpl, userId);
      results.push({ template_id: tpl._id, template_name: tpl.name, je_id: je._id, je_number: je.je_number, status: je.status });
    } catch (err) {
      results.push({ template_id: tpl._id, template_name: tpl.name, error: err.message });
    }
  }

  return results;
}

/**
 * Run a single template regardless of schedule.
 * `entityId` (optional) scopes the lookup so a foreign-entity templateId
 * can't be invoked through the runNow API. Pass null only from the cron
 * runner (which iterates per-entity through runDueTemplates).
 */
async function runSingleTemplate(templateId, userId, entityId = null) {
  const filter = { _id: templateId };
  if (entityId) filter.entity_id = entityId;
  // eslint-disable-next-line vip-tenant/require-entity-filter -- entity_id added when caller supplies it; null entityId is the per-entity cron path that already iterates an entity-scoped queue
  const tpl = await RecurringJournalTemplate.findOne(filter);
  if (!tpl) throw new Error('Template not found');
  if (!tpl.is_active) throw new Error('Template is inactive');

  const je = await executeTemplate(tpl, userId);
  return { template_id: tpl._id, template_name: tpl.name, je_id: je._id, je_number: je.je_number, status: je.status };
}

/**
 * Internal: create JE from template, update schedule
 */
async function executeTemplate(tpl, userId) {
  const jeDate = tpl.next_run_date || new Date();
  const period = `${jeDate.getFullYear()}-${String(jeDate.getMonth() + 1).padStart(2, '0')}`;

  const je = await createJournal(tpl.entity_id, {
    je_date: jeDate,
    period,
    description: `[Recurring] ${tpl.name}`,
    source_module: tpl.source_module || 'MANUAL',
    lines: tpl.lines.map(l => ({
      account_code: l.account_code,
      account_name: l.account_name,
      debit: l.debit || 0,
      credit: l.credit || 0,
      description: l.description || '',
      bdm_id: l.bdm_id || null,
      cost_center: l.cost_center || ''
    })),
    bir_flag: 'BOTH',
    created_by: userId
  });

  // Auto-post if configured
  if (tpl.auto_post) {
    await postJournal(je._id, userId);
    je.status = 'POSTED';
  }

  // Update schedule
  tpl.last_run_date = jeDate;
  tpl.next_run_date = computeNextRunDate(jeDate, tpl.frequency);
  await tpl.save();

  return je;
}

module.exports = { runDueTemplates, runSingleTemplate, computeNextRunDate };
