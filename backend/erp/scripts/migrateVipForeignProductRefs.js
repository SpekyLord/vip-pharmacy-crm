/**
 * Phase G7.A prelude — surgical repoint of VIP transactional rows that
 * reference a foreign-entity product_id back to VIP's own ProductMaster row
 * for the same item_key. Also reactivates VIP's row if it was deactivated.
 *
 * Background (May 05 2026): two duplicate item_keys exist on dev cluster —
 * Viprazole|40mg and Nupira|10mg/10mL — each with one row in VIP and one in
 * MILLIGRAMS AND CO. INC. VIP-entity InventoryLedger rows reference
 * MG-and-CO's product_id (8 rows for Viprazole, 0 for Nupira), which is why
 * the GRN validator at inventoryController.js:643 rejects new VIP GRNs for
 * those products. Phase G7.A.1 will dedupe these globally; tonight's
 * migration repoints VIP-side refs only so today's GRN unblocks.
 *
 * Idempotent. Dry-run by default. Pass --apply to commit.
 *
 * Usage:
 *   node backend/erp/scripts/migrateVipForeignProductRefs.js          # dry-run
 *   node backend/erp/scripts/migrateVipForeignProductRefs.js --apply  # commit
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const ProductMaster = require('../models/ProductMaster');
const Entity = require('../models/Entity');
const InventoryLedger = require('../models/InventoryLedger');
const SalesLine = require('../models/SalesLine');
const GrnEntry = require('../models/GrnEntry');
const Undertaking = require('../models/Undertaking');
const StockReassignment = require('../models/StockReassignment');
const PurchaseOrder = require('../models/PurchaseOrder');
const SupplierInvoice = require('../models/SupplierInvoice');
const ConsignmentTracker = require('../models/ConsignmentTracker');
const CreditNote = require('../models/CreditNote');
const HospitalContractPrice = require('../models/HospitalContractPrice');
const { HospitalPO, HospitalPOLine } = require('../models/HospitalPO');
const MdProductRebate = require('../models/MdProductRebate');
const MdCapitationRule = require('../models/MdCapitationRule');
const ProductMapping = require('../models/ProductMapping');
const TransferPriceList = require('../models/TransferPriceList');
const RebatePayout = require('../models/RebatePayout');
const SalesBookSCPWD = require('../models/SalesBookSCPWD');
const PnlReport = require('../models/PnlReport');
const InterCompanyTransfer = require('../models/InterCompanyTransfer');
const CreditRule = require('../models/CreditRule');

const APPLY = process.argv.includes('--apply');
const VIP_ID = '69cd76ec7f6beb5888bd1a53';

/**
 * Cascade manifest — mirrors the doctorMergeService.js pattern (Phase A.5.5).
 * Each entry: { Model, kind, scalarPath?, arrayField?, arrayPath? }
 *   - 'simple': bulk updateMany on a top-level scalar path
 *   - 'subdoc-array': positional updateMany on `arrayField.$[].arrayPath` via arrayFilters
 */
const CASCADE = [
  { name: 'InventoryLedger',     Model: InventoryLedger,     kind: 'simple', path: 'product_id' },
  { name: 'SalesLine',           Model: SalesLine,           kind: 'simple', path: 'product_id' },
  { name: 'GrnEntry.line_items', Model: GrnEntry,            kind: 'subdoc-array', arrayField: 'line_items', arrayPath: 'product_id' },
  { name: 'Undertaking',         Model: Undertaking,         kind: 'simple', path: 'product_id' },
  { name: 'StockReassignment',   Model: StockReassignment,   kind: 'simple', path: 'product_id' },
  { name: 'PurchaseOrder.line_items',  Model: PurchaseOrder,  kind: 'subdoc-array', arrayField: 'line_items', arrayPath: 'product_id' },
  { name: 'SupplierInvoice.line_items',Model: SupplierInvoice,kind: 'subdoc-array', arrayField: 'line_items', arrayPath: 'product_id' },
  { name: 'ConsignmentTracker',  Model: ConsignmentTracker,  kind: 'simple', path: 'product_id' },
  { name: 'CreditNote.line_items',     Model: CreditNote,    kind: 'subdoc-array', arrayField: 'line_items', arrayPath: 'product_id' },
  { name: 'HospitalContractPrice',     Model: HospitalContractPrice, kind: 'simple', path: 'product_id' },
  { name: 'HospitalPO.line_items',     Model: HospitalPO,    kind: 'subdoc-array', arrayField: 'line_items', arrayPath: 'product_id' },
  { name: 'HospitalPOLine',      Model: HospitalPOLine,      kind: 'simple', path: 'product_id' },
  { name: 'MdProductRebate',     Model: MdProductRebate,     kind: 'simple', path: 'product_id' },
  { name: 'MdCapitationRule',    Model: MdCapitationRule,    kind: 'simple', path: 'product_id' },
  { name: 'TransferPriceList',   Model: TransferPriceList,   kind: 'simple', path: 'product_id' },
  { name: 'RebatePayout',        Model: RebatePayout,        kind: 'simple', path: 'product_id' },
  { name: 'SalesBookSCPWD',      Model: SalesBookSCPWD,      kind: 'simple', path: 'product_id' },
  { name: 'PnlReport',           Model: PnlReport,           kind: 'simple', path: 'product_id' },
  { name: 'InterCompanyTransfer',Model: InterCompanyTransfer,kind: 'simple', path: 'product_id' },
  { name: 'CreditRule',          Model: CreditRule,          kind: 'simple', path: 'product_id' },
];

async function countAndRepoint({ entry, fromId, toId, entityId, dry }) {
  const { Model, kind, path: scalarPath, arrayField, arrayPath } = entry;
  if (kind === 'simple') {
    const filter = { entity_id: entityId, [scalarPath]: fromId };
    const n = await Model.countDocuments(filter);
    if (n === 0) return 0;
    if (!dry) await Model.updateMany(filter, { $set: { [scalarPath]: toId } });
    return n;
  } else if (kind === 'subdoc-array') {
    const filter = { entity_id: entityId, [`${arrayField}.${arrayPath}`]: fromId };
    const n = await Model.countDocuments(filter);
    if (n === 0) return 0;
    if (!dry) {
      await Model.updateMany(
        filter,
        { $set: { [`${arrayField}.$[el].${arrayPath}`]: toId } },
        { arrayFilters: [{ [`el.${arrayPath}`]: fromId }] }
      );
    }
    return n;
  }
  return 0;
}

(async () => {
  await connectDB();
  console.log(APPLY ? '=== APPLY MODE — committing changes ===' : '=== DRY RUN — no writes ===');
  console.log();

  const dups = await ProductMaster.aggregate([
    { $group: { _id: '$item_key', count: { $sum: 1 }, ids: { $push: { id: '$_id', entity: '$entity_id', active: '$is_active', brand: '$brand_name', dosage: '$dosage_strength' } } } },
    { $match: { count: { $gt: 1 } } },
  ]);

  let totalRepointed = 0;
  let totalReactivated = 0;
  const auditRows = [];

  for (const d of dups) {
    const vipRow = d.ids.find((r) => r.entity.toString() === VIP_ID);
    const otherRow = d.ids.find((r) => r.entity.toString() !== VIP_ID);
    if (!vipRow || !otherRow) {
      console.log(`SKIP item_key=${d._id} — no VIP/other split`);
      continue;
    }

    const otherEnt = await Entity.findById(otherRow.entity).select('entity_name').lean();
    console.log(`── ${d._id} ──`);
    console.log(`  KEEP (winner) VIP    row = ${vipRow.id}  active=${vipRow.active}`);
    console.log(`  STOP foreign  ${otherEnt.entity_name} row = ${otherRow.id}  active=${otherRow.active}  (kept untouched — other entity owns it)`);

    let ledgerCount = 0;
    for (const entry of CASCADE) {
      const n = await countAndRepoint({
        entry,
        fromId: otherRow.id,
        toId: vipRow.id,
        entityId: VIP_ID,
        dry: !APPLY,
      });
      if (n > 0) {
        console.log(`  ${entry.name.padEnd(36)} ${n} VIP rows ${APPLY ? 'repointed' : 'WOULD repoint'}`);
        totalRepointed += n;
        if (entry.name === 'InventoryLedger') ledgerCount = n;
        auditRows.push({ item_key: d._id, model: entry.name, count: n, from: otherRow.id, to: vipRow.id });
      }
    }

    if (!vipRow.active) {
      if (APPLY) {
        await ProductMaster.updateOne({ _id: vipRow.id }, { $set: { is_active: true } });
      }
      console.log(`  ProductMaster reactivate VIP row ${APPLY ? 'DONE' : 'WOULD'}`);
      totalReactivated += 1;
      auditRows.push({ item_key: d._id, model: 'ProductMaster.reactivate', count: 1, from: vipRow.id, to: vipRow.id });
    }
    console.log();
  }

  console.log('=== Summary ===');
  console.log(`Repointed transactional refs: ${totalRepointed}`);
  console.log(`Reactivated VIP rows:         ${totalReactivated}`);
  console.log(`Mode: ${APPLY ? 'APPLIED' : 'DRY RUN — re-run with --apply to commit'}`);

  if (APPLY) {
    const auditPath = path.join(__dirname, `../../../reports/migrateVipForeignProductRefs_${Date.now()}.json`);
    require('fs').mkdirSync(path.dirname(auditPath), { recursive: true });
    require('fs').writeFileSync(auditPath, JSON.stringify(auditRows, null, 2));
    console.log(`Audit: ${auditPath}`);
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); mongoose.disconnect(); process.exit(1); });
