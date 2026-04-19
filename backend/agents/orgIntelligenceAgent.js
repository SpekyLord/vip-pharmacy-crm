/**
 * Org Intelligence Agent (#O)
 *
 * Weekly AI agent that analyzes partner scorecards across all entities
 * and produces actionable intelligence digest for the President.
 *
 * Schedule: Monday 5:30 AM (after daily scorecard refresh at 5:00 AM)
 * Type: Paid (uses Claude API)
 */
const Anthropic = require('@anthropic-ai/sdk');
const PartnerScorecard = require('../erp/models/PartnerScorecard');
const PeopleMaster = require('../erp/models/PeopleMaster');
const Entity = require('../erp/models/Entity');
const AgentRun = require('../erp/models/AgentRun');
const MessageInbox = require('../models/MessageInbox');
const User = require('../models/User');
const { ROLES } = require('../constants/roles');

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function previousPeriod() {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

async function run() {
  const startTime = Date.now();
  const period = currentPeriod();
  const prevPeriod = previousPeriod();

  try {
    // Get all entities
    const entities = await Entity.find({ status: 'ACTIVE' }).select('entity_name short_name entity_type').lean();

    // Get current and previous scorecards
    const current = await PartnerScorecard.find({ period })
      .populate('person_id', 'full_name person_type position bdm_code date_hired entity_id')
      .populate('entity_id', 'short_name')
      .sort({ score_overall: -1 })
      .lean();

    const previous = await PartnerScorecard.find({ period: prevPeriod })
      .select('person_id score_overall')
      .lean();
    const prevMap = new Map(previous.map(s => [s.person_id.toString(), s.score_overall]));

    if (current.length === 0) {
      console.log('[OrgIntelligence] No scorecards found — skipping.');
      return;
    }

    // Build data summary for Claude
    const partnerData = current.map((s, i) => {
      const prevScore = prevMap.get(s.person_id?._id?.toString()) || null;
      const delta = prevScore !== null ? s.score_overall - prevScore : null;
      return {
        rank: i + 1,
        name: s.person_id?.full_name || 'Unknown',
        type: s.person_id?.person_type || 'BDM',
        entity: s.entity_id?.short_name || '?',
        score_overall: s.score_overall,
        delta: delta !== null ? `${delta >= 0 ? '+' : ''}${delta}` : 'new',
        visits: `${s.visits_completed}/${s.visits_expected} (${s.visit_compliance_pct}%)`,
        sales: `₱${(s.sales_total || 0).toLocaleString()}`,
        collections: `₱${(s.collections_total || 0).toLocaleString()} (${s.collection_rate_pct}%)`,
        expense_ratio: `${s.expense_sales_ratio_pct}%`,
        engagement: s.avg_engagement_level,
        clients: `${s.total_clients_assigned} assigned, ${s.clients_at_risk} at risk`,
        graduation: `${s.graduation?.checklist_met || 0}/${s.graduation?.checklist_total || 7}`,
        graduation_ready: s.graduation?.ready || false,
        blocking_criteria: (s.graduation?.criteria || []).filter(c => !c.met).map(c => `${c.label}: ${c.actual} (need ${c.comparator === 'lte' ? '≤' : '≥'}${c.target})`),
        ai_insights: (s.ai_insights || []).map(i => `[${i.agent}] ${i.message}`),
      };
    });

    const entitySummary = entities.map(e => {
      const ePeople = current.filter(s => s.entity_id?._id?.toString() === e._id.toString());
      return {
        name: e.short_name || e.entity_name,
        type: e.entity_type,
        partners: ePeople.length,
        avg_score: ePeople.length > 0 ? Math.round(ePeople.reduce((s, p) => s + p.score_overall, 0) / ePeople.length) : 0,
      };
    });

    // Call Claude API
    const client = new Anthropic();
    const prompt = `You are the Org Intelligence Analyst for VIP Group (VIOS INTEGRATED PROJECTS INC.), a pharmaceutical company.

CONTEXT:
- VIP is a parent company that supplies subsidiaries.
- BDMs are partners/entrepreneurs-to-be who can graduate to own their own subsidiary.
- Graduation requires meeting 7 criteria (months active, clients, sales, collection rate, expense ratio, visit compliance, engagement).
- The President (Gregg) needs actionable, concise insights — not just numbers.

ENTITIES:
${JSON.stringify(entitySummary, null, 2)}

PARTNER SCORECARDS (${period}):
${JSON.stringify(partnerData, null, 2)}

Produce a weekly org intelligence digest. Use this exact format:

📊 ORG INTELLIGENCE — Week of [date]

GROUP HEALTH: [1 line summary with avg score and trend]

🏆 TOP PERFORMERS (top 3)
[rank. name — score (delta) — key strength]

⚠️ NEEDS ATTENTION
[partners with score <50 or declining >10 points — what's wrong]

🎓 GRADUATION PIPELINE
[partners closest to graduation — what criteria they still need — specific recommendation]

📈 TRENDS
[3 bullet points on org-wide patterns]

💡 RECOMMENDATIONS
[3 specific, actionable recommendations for the President]

Keep it concise, specific, and actionable. Use real names and numbers from the data.`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const digest = response.content[0]?.text || 'Unable to generate digest.';

    // Send message to President.
    // Phase G9.R2 — also pull entity_id so the row is properly scoped in the
    // unified inbox; folder=AI_AGENT_REPORTS surfaces it under "AI Agents".
    // Cross-entity org-intelligence digest goes to each president scoped to
    // their own primary entity (so list endpoints filtered by entity still
    // see it). Presidents without entity_id get null — visible to them via
    // cross-entity privilege.
    const presidents = await User.find({ role: ROLES.PRESIDENT })
      .select('_id entity_id entity_ids').lean();
    const messageIds = [];

    for (const pres of presidents) {
      const presEntityId = pres.entity_id
        || (Array.isArray(pres.entity_ids) && pres.entity_ids.length > 0 ? pres.entity_ids[0] : null);
      const msg = await MessageInbox.create({
        recipientUserId: pres._id,
        recipientRole: ROLES.PRESIDENT,
        title: `Org Intelligence — ${period}`,
        body: digest,
        category: 'ai_coaching',
        priority: 'normal',
        senderName: 'Org Intelligence Agent',
        senderRole: 'system',
        entity_id: presEntityId,
        folder: 'AI_AGENT_REPORTS',
      });
      messageIds.push(msg._id);
    }

    // Log agent run
    const topPerformers = partnerData.slice(0, 3).map(p => `${p.name}: ${p.score_overall}`);
    const nearGrad = partnerData.filter(p => p.graduation.startsWith('6/') || p.graduation.startsWith('7/')).map(p => p.name);

    await AgentRun.create({
      agent_key: 'org_intelligence',
      agent_label: 'Org Intelligence',
      status: 'success',
      summary: {
        bdms_processed: current.length,
        alerts_generated: partnerData.filter(p => p.score_overall < 50).length,
        messages_sent: messageIds.length,
        key_findings: [
          `Avg score: ${Math.round(current.reduce((s, c) => s + c.score_overall, 0) / current.length)}`,
          `Top: ${topPerformers.join(', ')}`,
          nearGrad.length > 0 ? `Near graduation: ${nearGrad.join(', ')}` : 'No partners near graduation yet',
        ],
      },
      message_ids: messageIds,
      execution_ms: Date.now() - startTime,
    });

    console.log(`[OrgIntelligence] Digest sent to ${messageIds.length} president(s). ${current.length} partners analyzed.`);
  } catch (err) {
    console.error('[OrgIntelligence] Error:', err.message);
    await AgentRun.create({
      agent_key: 'org_intelligence',
      agent_label: 'Org Intelligence',
      status: 'error',
      error_msg: err.message,
      execution_ms: Date.now() - startTime,
    });
  }
}

module.exports = { run };
