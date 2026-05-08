/**
 * Diagnostic — PO visibility for Jay Ann Protacio @ MG and CO.
 *
 * Verifies:
 *   1. Jay Ann's user record (role, entity_id, entity_ids, erp_access)
 *   2. MG and CO entity _id
 *   3. ALL POs at MG and CO + ownership distribution
 *   4. POs Jay Ann would see under current bdm_id-gated tenantFilter
 *   5. POs Jay Ann would see under proposed widenFilterForProxy() gate
 *   6. PROXY_ENTRY_ROLES.PURCHASING lookup state
 *
 * Read-only. Safe on prod — but env points at dev cluster by default.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const User = require('../models/User');
  const Entity = require('../erp/models/Entity');
  const PurchaseOrder = require('../erp/models/PurchaseOrder');
  const Lookup = require('../erp/models/Lookup');

  const TARGET_NAME = /jay\s*ann/i;
  const TARGET_ENTITY = /mg.*co/i;

  const user = await User.findOne({
    $or: [{ name: TARGET_NAME }, { firstName: TARGET_NAME }, { email: /jayann|jay.ann|protacio/i }],
  }).lean();
  if (!user) { console.log('[FAIL] Jay Ann user not found'); process.exit(1); }

  let entity = await Entity.findOne({ entity_name: TARGET_ENTITY }).lean();
  if (!entity) {
    console.log('[INFO] entity_name regex miss; listing all entities to find match...');
    const all = await Entity.find({}).select('_id entity_name entity_code').lean();
    for (const e of all) console.log(`  ${e._id} | ${e.entity_name || '(blank)'} | code=${e.entity_code || '-'}`);
    entity = all.find(e => /milligram/i.test(e.entity_name || ''));
    if (!entity) { console.log('[FAIL] MG and CO entity not found'); process.exit(1); }
    console.log(`[OK] resolved entity: ${entity._id} ${entity.entity_name}`);
  }

  console.log('═══ USER ═══');
  console.log({
    _id: user._id.toString(),
    name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    email: user.email,
    role: user.role,
    entity_id: user.entity_id?.toString(),
    entity_ids: (user.entity_ids || []).map(String),
    erp_access_enabled: user.erp_access?.enabled,
    erp_purchasing_perm: user.erp_access?.modules?.purchasing,
    erp_purchasing_subperms: user.erp_access?.sub_permissions?.purchasing,
  });

  console.log('\n═══ ENTITY ═══');
  console.log({ _id: entity._id.toString(), entity_name: entity.entity_name });

  console.log('\n═══ ALL POs @ MG and CO ═══');
  const allPos = await PurchaseOrder.find({ entity_id: entity._id })
    .populate('bdm_id', 'name email role')
    .select('po_number status bdm_id created_by created_at')
    .sort({ created_at: -1 })
    .limit(20)
    .lean();
  console.log(`Total: ${allPos.length}`);
  for (const po of allPos) {
    console.log(`  ${po.po_number || '(no#)'} | ${po.status} | bdm=${po.bdm_id?.name || po.bdm_id?.email || po.bdm_id?._id?.toString() || 'N/A'} (${po.bdm_id?.role || '?'}) | ${po.created_at?.toISOString().slice(0, 10)}`);
  }

  console.log('\n═══ PO COUNT (current filter: entity_id + bdm_id) ═══');
  const ownPos = await PurchaseOrder.countDocuments({ entity_id: entity._id, bdm_id: user._id });
  console.log(`Jay Ann sees: ${ownPos}`);

  console.log('\n═══ PO COUNT (proposed filter: entity_id only IF proxy) ═══');
  const allEntPos = await PurchaseOrder.countDocuments({ entity_id: entity._id });
  console.log(`If proxy gate passes, Jay Ann would see: ${allEntPos}`);

  console.log('\n═══ PROXY_ENTRY_ROLES.PURCHASING lookup @ MG and CO ═══');
  const proxyLookup = await Lookup.findOne({
    entity_id: entity._id,
    category: 'PROXY_ENTRY_ROLES',
    code: 'PURCHASING',
    is_active: true,
  }).lean();
  console.log(proxyLookup ? { roles: proxyLookup.metadata?.roles, label: proxyLookup.label } : 'NOT SEEDED — falls back to defaults [admin, finance, president]');

  console.log('\n═══ Sub-permission check ═══');
  const subPerm = !!user.erp_access?.sub_permissions?.purchasing?.proxy_entry;
  console.log(`Jay Ann has erp_access.sub_permissions.purchasing.proxy_entry = ${subPerm}`);

  console.log('\n═══ Jay Ann full entity assignment ═══');
  const userFull = await User.findById(user._id).select('entity_id entity_ids entity_ids_static').lean();
  console.log({
    entity_id: userFull.entity_id?.toString(),
    entity_ids: (userFull.entity_ids || []).map(String),
    entity_ids_static: (userFull.entity_ids_static || []).map(String),
  });

  console.log('\n═══ POs Jay Ann ACTUALLY created (any entity) ═══');
  const herPos = await PurchaseOrder.find({ bdm_id: user._id })
    .populate('entity_id', 'entity_name')
    .select('po_number status entity_id created_at')
    .sort({ created_at: -1 })
    .limit(10)
    .lean();
  console.log(`Total: ${herPos.length}`);
  for (const po of herPos) {
    console.log(`  ${po.po_number || '(no#)'} | ${po.status} | entity=${po.entity_id?.entity_name || po.entity_id} | ${po.created_at?.toISOString().slice(0,10)}`);
  }

  console.log('\n═══ ALL POs in system (top 20 most recent) ═══');
  const recentAll = await PurchaseOrder.find({})
    .populate('entity_id', 'entity_name')
    .populate('bdm_id', 'name email role')
    .populate('created_by', 'name email role')
    .select('po_number status entity_id bdm_id created_by created_at warehouse_id')
    .sort({ created_at: -1 })
    .limit(20)
    .lean();
  console.log(`Total recent: ${recentAll.length}`);
  for (const po of recentAll) {
    const ts = po.created_at?.toISOString().slice(0, 16);
    console.log(`  ${ts} | ${po.po_number || '(no#)'} | ${po.status} | entity=${po.entity_id?.entity_name?.slice(0,15) || '?'} | bdm=${po.bdm_id?.name || po.bdm_id?.email || '?'} | by=${po.created_by?.name || po.created_by?.email || '?'}`);
  }

  console.log('\n═══ PO TOTAL COUNT IN SYSTEM ═══');
  const totalAll = await PurchaseOrder.countDocuments({});
  console.log(`Total: ${totalAll}`);

  console.log('\n═══ POs at VIP entity (her primary) ═══');
  const vipEntity = await Entity.findOne({ entity_name: /VIOS/i }).lean();
  const vipPos = await PurchaseOrder.find({ entity_id: vipEntity._id, bdm_id: user._id })
    .select('po_number status created_at')
    .sort({ created_at: -1 })
    .limit(10)
    .lean();
  console.log(`Total Jay Ann's POs @ VIP: ${vipPos.length}`);
  for (const po of vipPos) {
    console.log(`  ${po.po_number || '(no#)'} | ${po.status} | ${po.created_at?.toISOString().slice(0,10)}`);
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
