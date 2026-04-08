/**
 * Org Intelligence Agent (#O)
 *
 * Weekly AI agent that analyzes partner scorecards across all entities
 * and produces an actionable intelligence digest for the President.
 */

const PartnerScorecard = require('../erp/models/PartnerScorecard');
const Entity = require('../erp/models/Entity');
const { askClaude } = require('./claudeClient');
const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function previousPeriod() {
  const now = new Date();
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
}

async function run() {
  const period = currentPeriod();
  const prevPeriod = previousPeriod();

  const entities = await Entity.find({ status: 'ACTIVE' }).select('entity_name short_name entity_type').lean();

  const current = await PartnerScorecard.find({ period })
    .populate('person_id', 'full_name person_type position bdm_code date_hired entity_id')
    .populate('entity_id', 'short_name')
    .sort({ score_overall: -1 })
    .lean();

  const previous = await PartnerScorecard.find({ period: prevPeriod })
    .select('person_id score_overall')
    .lean();
  const prevMap = new Map(previous.map((scorecard) => [scorecard.person_id.toString(), scorecard.score_overall]));

  if (!current.length) {
    console.log('[OrgIntelligence] No scorecards found - skipping.');
    return {
      status: 'success',
      summary: {
        bdms_processed: 0,
        alerts_generated: 0,
        messages_sent: 0,
        key_findings: [`No partner scorecards found for ${period}.`],
      },
      message_ids: [],
    };
  }

  const partnerData = current.map((scorecard, index) => {
    const prevScore = prevMap.get(scorecard.person_id?._id?.toString()) || null;
    const delta = prevScore !== null ? scorecard.score_overall - prevScore : null;

    return {
      rank: index + 1,
      name: scorecard.person_id?.full_name || 'Unknown',
      type: scorecard.person_id?.person_type || 'BDM',
      entity: scorecard.entity_id?.short_name || '?',
      score_overall: scorecard.score_overall,
      delta: delta !== null ? `${delta >= 0 ? '+' : ''}${delta}` : 'new',
      visits: `${scorecard.visits_completed}/${scorecard.visits_expected} (${scorecard.visit_compliance_pct}%)`,
      sales: `PHP ${(scorecard.sales_total || 0).toLocaleString()}`,
      collections: `PHP ${(scorecard.collections_total || 0).toLocaleString()} (${scorecard.collection_rate_pct}%)`,
      expense_ratio: `${scorecard.expense_sales_ratio_pct}%`,
      engagement: scorecard.avg_engagement_level,
      clients: `${scorecard.total_clients_assigned} assigned, ${scorecard.clients_at_risk} at risk`,
      graduation: `${scorecard.graduation?.checklist_met || 0}/${scorecard.graduation?.checklist_total || 7}`,
      graduation_ready: scorecard.graduation?.ready || false,
      blocking_criteria: (scorecard.graduation?.criteria || [])
        .filter((criterion) => !criterion.met)
        .map((criterion) => `${criterion.label}: ${criterion.actual} (need ${criterion.comparator === 'lte' ? '<=' : '>='}${criterion.target})`),
      ai_insights: (scorecard.ai_insights || []).map((insight) => `[${insight.agent}] ${insight.message}`),
    };
  });

  const entitySummary = entities.map((entity) => {
    const people = current.filter((scorecard) => scorecard.entity_id?._id?.toString() === entity._id.toString());
    return {
      name: entity.short_name || entity.entity_name,
      type: entity.entity_type,
      partners: people.length,
      avg_score: people.length > 0 ? Math.round(people.reduce((sum, person) => sum + person.score_overall, 0) / people.length) : 0,
    };
  });

  const { text } = await askClaude({
    system: `You are the Org Intelligence Analyst for VIP Group, a Philippine pharmaceutical company.

The President needs actionable, concise insights on:
- Group health and score trends
- Top performers
- People needing attention
- Graduation pipeline readiness
- Org-wide patterns and next actions

Use real names and numbers from the supplied data.`,
    prompt: `Entities:\n${JSON.stringify(entitySummary, null, 2)}\n\nPartner scorecards for ${period}:\n${JSON.stringify(partnerData, null, 2)}\n\nProduce a weekly org intelligence digest with short sections for group health, top performers, needs attention, graduation pipeline, trends, and recommendations.`,
    maxTokens: 1000,
    agent: 'org_intelligence',
  });

  const notificationResults = await notify({
    recipient_id: 'PRESIDENT',
    title: `Org Intelligence - ${period}`,
    body: text,
    category: 'ai_coaching',
    priority: 'normal',
    channels: ['in_app'],
    agent: 'org_intelligence',
  });

  const topPerformers = partnerData.slice(0, 3).map((partner) => `${partner.name}: ${partner.score_overall}`);
  const nearGraduation = partnerData
    .filter((partner) => partner.graduation.startsWith('6/') || partner.graduation.startsWith('7/'))
    .map((partner) => partner.name);

  console.log(`[OrgIntelligence] Digest sent to ${countSuccessfulChannels(notificationResults, 'in_app')} president recipient(s). ${current.length} partners analyzed.`);

  return {
    status: 'success',
    summary: {
      bdms_processed: current.length,
      alerts_generated: partnerData.filter((partner) => partner.score_overall < 50).length,
      messages_sent: countSuccessfulChannels(notificationResults, 'in_app'),
      key_findings: [
        `Avg score: ${Math.round(current.reduce((sum, scorecard) => sum + scorecard.score_overall, 0) / current.length)}`,
        `Top: ${topPerformers.join(', ')}`,
        nearGraduation.length > 0 ? `Near graduation: ${nearGraduation.join(', ')}` : 'No partners near graduation yet',
      ],
    },
    message_ids: getInAppMessageIds(notificationResults),
  };
}

module.exports = { run };
