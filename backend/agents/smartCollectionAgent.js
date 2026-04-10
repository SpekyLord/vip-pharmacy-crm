/**
 * Smart Collection Agent (#1) - AI-powered AR collection prioritization.
 */

const { askClaude } = require('./claudeClient');
const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');

async function run() {
  console.log('[SmartCollection] Running...');

  const Collection = require('../erp/models/Collection');
  const SalesLine = require('../erp/models/SalesLine');
  const Hospital = require('../erp/models/Hospital');
  const Entity = require('../erp/models/Entity');

  const entities = await Entity.find({ is_active: true }).lean();
  if (!entities.length) {
    return {
      status: 'success',
      summary: {
        bdms_processed: 0,
        alerts_generated: 0,
        messages_sent: 0,
        key_findings: ['No active entities found for collection prioritization.'],
      },
      message_ids: [],
    };
  }

  const notificationResults = [];
  const entityFindings = [];
  let bdmCount = 0;
  let hospitalsAnalyzed = 0;

  for (const entity of entities) {
    const now = new Date();
    const unpaidCSIs = await SalesLine.find({
      entity_id: entity._id,
      status: 'POSTED',
      payment_status: { $in: ['UNPAID', 'PARTIAL'] },
    }).select('hospital_id invoice_date total_amount paid_amount balance bdm_id').lean();

    if (!unpaidCSIs.length) continue;

    const hospitalMap = {};
    for (const csi of unpaidCSIs) {
      const hospitalId = csi.hospital_id?.toString();
      if (!hospitalId) continue;
      if (!hospitalMap[hospitalId]) {
        hospitalMap[hospitalId] = { total: 0, current: 0, d30: 0, d60: 0, d90: 0, count: 0, bdmIds: new Set() };
      }

      const hospital = hospitalMap[hospitalId];
      const ageDays = Math.floor((now - new Date(csi.invoice_date)) / 86400000);
      const balance = (csi.balance || csi.total_amount || 0) - (csi.paid_amount || 0);
      hospital.total += balance;
      hospital.count += 1;
      if (ageDays <= 30) hospital.current += balance;
      else if (ageDays <= 60) hospital.d30 += balance;
      else if (ageDays <= 90) hospital.d60 += balance;
      else hospital.d90 += balance;
      if (csi.bdm_id) hospital.bdmIds.add(csi.bdm_id.toString());
    }

    const recentCollections = await Collection.find({
      entity_id: entity._id,
      status: 'POSTED',
      cr_date: { $gte: new Date(now.getFullYear(), now.getMonth() - 3, 1) },
    }).select('hospital_id cr_amount').lean();

    const collectionHistory = {};
    for (const receipt of recentCollections) {
      const hospitalId = receipt.hospital_id?.toString();
      if (!hospitalId) continue;
      if (!collectionHistory[hospitalId]) collectionHistory[hospitalId] = { total: 0, count: 0 };
      collectionHistory[hospitalId].total += receipt.cr_amount || 0;
      collectionHistory[hospitalId].count += 1;
    }

    const hospitalIds = Object.keys(hospitalMap);
    if (!hospitalIds.length) continue;

    const hospitals = await Hospital.find({ _id: { $in: hospitalIds } }).select('hospital_name').lean();
    const nameMap = {};
    for (const hospital of hospitals) nameMap[hospital._id.toString()] = hospital.hospital_name;

    const entries = hospitalIds
      .sort((a, b) => hospitalMap[b].total - hospitalMap[a].total)
      .slice(0, 20)
      .map((hospitalId) => {
        const hospital = hospitalMap[hospitalId];
        const history = collectionHistory[hospitalId];
        return `${nameMap[hospitalId] || hospitalId}: Total AR PHP ${hospital.total.toLocaleString()}, ${hospital.count} invoices (Current: PHP ${hospital.current.toLocaleString()}, 30d: PHP ${hospital.d30.toLocaleString()}, 60d: PHP ${hospital.d60.toLocaleString()}, 90+d: PHP ${hospital.d90.toLocaleString()}) | Last 3 months collections: ${history ? `${history.count} payments, PHP ${history.total.toLocaleString()}` : 'None'}`;
      });

    const { text } = await askClaude({
      system: `You are a collections strategist for a Philippine pharma distributor. Prioritize hospitals for collection calls today. Consider aging severity, payment history, and amount at risk. For each hospital, suggest a brief talking point or approach.`,
      prompt: `Today: ${now.toLocaleDateString('en-PH')}\nEntity: ${entity.entity_name}\n\nAR aging by hospital:\n${entries.join('\n')}\n\nPrioritize the top 5-8 hospitals to call today with brief strategies. Format as a numbered list.`,
      maxTokens: 800,
      agent: 'smart_collection',
    });

    notificationResults.push(
      ...(await notify({
        recipient_id: 'PRESIDENT',
        title: `Collection Priority - ${entity.entity_name}`,
        body: text,
        category: 'ai_alert',
        priority: 'important',
        channels: ['in_app'],
        agent: 'smart_collection',
      }))
    );

    const bdmIds = new Set();
    for (const hospital of Object.values(hospitalMap)) {
      for (const bdmId of hospital.bdmIds) bdmIds.add(bdmId);
    }

    for (const bdmId of bdmIds) {
      notificationResults.push(
        ...(await notify({
          recipient_id: bdmId,
          title: 'Collection Follow-Up Required',
          body: 'The AI collection agent identified hospitals in your territory with overdue payments. Check your inbox for the full priority list.',
          category: 'ai_alert',
          priority: 'normal',
          channels: ['in_app'],
          agent: 'smart_collection',
        }))
      );
    }

    bdmCount += bdmIds.size;
    hospitalsAnalyzed += hospitalIds.length;
    entityFindings.push(`${entity.entity_name}: analyzed ${hospitalIds.length} hospitals with overdue balances`);
    console.log(`[SmartCollection] ${entity.entity_name}: analyzed ${hospitalIds.length} hospitals, notified president + ${bdmIds.size} BDMs`);
  }

  if (!entityFindings.length) {
    return {
      status: 'success',
      summary: {
        bdms_processed: 0,
        alerts_generated: 0,
        messages_sent: 0,
        key_findings: ['No overdue receivables were found for collection prioritization.'],
      },
      message_ids: [],
    };
  }

  console.log('[SmartCollection] Done.');

  return {
    status: 'success',
    summary: {
      bdms_processed: bdmCount,
      alerts_generated: hospitalsAnalyzed,
      messages_sent: countSuccessfulChannels(notificationResults, 'in_app'),
      key_findings: entityFindings.slice(0, 5),
    },
    message_ids: getInAppMessageIds(notificationResults),
  };
}

module.exports = { run };
