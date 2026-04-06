/**
 * Smart Collection Agent (#1) — AI-powered AR collection prioritization
 *
 * Runs daily 7:00 AM weekdays. Analyzes:
 *   - AR aging buckets (current, 30, 60, 90+ days)
 *   - Payment history patterns per hospital
 *   - Collection success rates by BDM
 *
 * Outputs: Prioritized list of hospitals to call today, with talking points.
 * Notifies: PRESIDENT + relevant BDMs
 */
const { askClaude } = require('./claudeClient');
const { notify } = require('./notificationService');

async function run() {
  console.log('[SmartCollection] Running...');
  try {
    const Collection = require('../erp/models/Collection');
    const SalesLine = require('../erp/models/SalesLine');
    const Hospital = require('../erp/models/Hospital');
    const User = require('../models/User');
    const Entity = require('../erp/models/Entity');

    const entities = await Entity.find({ is_active: true }).lean();

    for (const entity of entities) {
      const entityId = entity._id;

      // Get unpaid/partial CSIs with aging
      const now = new Date();
      const unpaidCSIs = await SalesLine.find({
        entity_id: entityId,
        status: 'POSTED',
        payment_status: { $in: ['UNPAID', 'PARTIAL'] }
      }).select('hospital_id invoice_date total_amount paid_amount balance bdm_id').lean();

      if (!unpaidCSIs.length) continue;

      // Build aging summary per hospital
      const hospitalMap = {};
      for (const csi of unpaidCSIs) {
        const hId = csi.hospital_id?.toString();
        if (!hId) continue;
        if (!hospitalMap[hId]) hospitalMap[hId] = { total: 0, current: 0, d30: 0, d60: 0, d90: 0, count: 0, bdm_ids: new Set() };
        const h = hospitalMap[hId];
        const ageDays = Math.floor((now - new Date(csi.invoice_date)) / 86400000);
        const balance = (csi.balance || csi.total_amount) - (csi.paid_amount || 0);
        h.total += balance;
        h.count++;
        if (ageDays <= 30) h.current += balance;
        else if (ageDays <= 60) h.d30 += balance;
        else if (ageDays <= 90) h.d60 += balance;
        else h.d90 += balance;
        if (csi.bdm_id) h.bdm_ids.add(csi.bdm_id.toString());
      }

      // Get recent collection history
      const recentCollections = await Collection.find({
        entity_id: entityId,
        status: 'POSTED',
        cr_date: { $gte: new Date(now.getFullYear(), now.getMonth() - 3, 1) }
      }).select('hospital_id cr_amount cr_date').lean();

      const collectionHistory = {};
      for (const cr of recentCollections) {
        const hId = cr.hospital_id?.toString();
        if (!hId) continue;
        if (!collectionHistory[hId]) collectionHistory[hId] = { total: 0, count: 0 };
        collectionHistory[hId].total += cr.cr_amount || 0;
        collectionHistory[hId].count++;
      }

      // Fetch hospital names
      const hospitalIds = Object.keys(hospitalMap);
      const hospitals = await Hospital.find({ _id: { $in: hospitalIds } }).select('hospital_name').lean();
      const nameMap = {};
      for (const h of hospitals) nameMap[h._id.toString()] = h.hospital_name;

      // Build data summary for Claude
      const entries = hospitalIds
        .sort((a, b) => hospitalMap[b].total - hospitalMap[a].total)
        .slice(0, 20)
        .map(hId => {
          const h = hospitalMap[hId];
          const hist = collectionHistory[hId];
          return `${nameMap[hId] || hId}: Total AR ₱${h.total.toLocaleString()}, ${h.count} invoices (Current: ₱${h.current.toLocaleString()}, 30d: ₱${h.d30.toLocaleString()}, 60d: ₱${h.d60.toLocaleString()}, 90+d: ₱${h.d90.toLocaleString()}) | Last 3mo collections: ${hist ? `${hist.count} payments, ��${hist.total.toLocaleString()}` : 'None'}`;
        });

      if (!entries.length) continue;

      const { text } = await askClaude({
        system: `You are a collections strategist for a Philippine pharma distributor. Prioritize hospitals for collection calls today. Consider: aging severity (90+ days = urgent), payment history, and amount at risk. For each hospital, suggest a brief talking point or approach. Be concise — this is for a morning briefing.`,
        prompt: `Today: ${now.toLocaleDateString('en-PH')}\nEntity: ${entity.entity_name}\n\nAR Aging by Hospital:\n${entries.join('\n')}\n\nPrioritize the top 5-8 hospitals to call today with brief strategies. Format as numbered list.`,
        maxTokens: 800,
        agent: 'smart_collection'
      });

      // Notify president
      await notify({
        recipient_id: 'PRESIDENT',
        title: `Collection Priority — ${entity.entity_name}`,
        body: text,
        category: 'collection_alert',
        priority: 'important',
        channels: ['in_app'],
        agent: 'smart_collection'
      });

      // Notify each BDM about their hospitals
      const bdmIds = new Set();
      for (const h of Object.values(hospitalMap)) {
        for (const bid of h.bdm_ids) bdmIds.add(bid);
      }
      for (const bdmId of bdmIds) {
        await notify({
          recipient_id: bdmId,
          title: `Collection Follow-Up Required`,
          body: `The AI collection agent identified hospitals in your territory with overdue payments. Check your inbox for the full priority list.`,
          category: 'collection_alert',
          priority: 'normal',
          channels: ['in_app'],
          agent: 'smart_collection'
        });
      }

      console.log(`[SmartCollection] ${entity.entity_name}: Analyzed ${hospitalIds.length} hospitals, notified president + ${bdmIds.size} BDMs`);
    }

    console.log('[SmartCollection] Done.');
  } catch (err) {
    console.error('[SmartCollection] Error:', err.message);
  }
}

module.exports = { run };
