/**
 * Data Archival Service — SAP Data Archiving (Phase 15.8)
 * Archive closed-period data, keep current + prior 2 months live
 */
const mongoose = require('mongoose');
const ArchiveBatch = require('../models/ArchiveBatch');
const ArchivedDocument = require('../models/ArchivedDocument');
const SalesLine = require('../models/SalesLine');
const Collection = require('../models/Collection');
const ExpenseEntry = require('../models/ExpenseEntry');
const SmerEntry = require('../models/SmerEntry');
const CarLogbookEntry = require('../models/CarLogbookEntry');
const JournalEntry = require('../models/JournalEntry');
const TransactionEvent = require('../models/TransactionEvent');

// Collections and their period field + archivable statuses
const ARCHIVABLE_COLLECTIONS = [
  { Model: SalesLine, name: 'sales_lines', periodField: 'period', dateField: 'csi_date', statuses: ['POSTED'] },
  { Model: Collection, name: 'collections', periodField: null, dateField: 'cr_date', statuses: ['POSTED'] },
  { Model: ExpenseEntry, name: 'expense_entries', periodField: 'period', statuses: ['POSTED'] },
  { Model: SmerEntry, name: 'smer_entries', periodField: 'period', statuses: ['POSTED'] },
  { Model: CarLogbookEntry, name: 'car_logbook_entries', periodField: 'period', statuses: ['POSTED'] },
  { Model: JournalEntry, name: 'journal_entries', periodField: 'period', statuses: ['POSTED'] },
  { Model: TransactionEvent, name: 'transaction_events', periodField: null, dateField: 'event_date', statuses: ['ACTIVE'] }
];

function computeCutoffPeriod() {
  const now = new Date();
  let month = now.getMonth() + 1 - 2; // keep current + prior 2
  let year = now.getFullYear();
  while (month < 1) { month += 12; year -= 1; }
  return `${year}-${String(month).padStart(2, '0')}`;
}

function generateBatchId() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0')
  ];
  return `ARCH-${parts.join('')}`;
}

/**
 * Archive documents from closed periods
 */
async function archivePeriods(entityId, userId) {
  const eId = new mongoose.Types.ObjectId(entityId);
  const cutoff = computeCutoffPeriod();
  const batchId = generateBatchId();

  const counts = {};
  let totalDocs = 0;
  const periodsSet = new Set();

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const { Model, name, periodField, dateField, statuses } of ARCHIVABLE_COLLECTIONS) {
        const match = { entity_id: eId, status: { $in: statuses } };

        if (periodField) {
          match[periodField] = { $lte: cutoff };
        } else if (dateField) {
          // For collections that use date instead of period
          const [y, m] = cutoff.split('-').map(Number);
          const cutoffEnd = new Date(y, m, 1); // first day of month after cutoff
          match[dateField] = { $lt: cutoffEnd };
        }

        const docs = await Model.find(match).session(session).lean();
        counts[name] = docs.length;
        totalDocs += docs.length;

        if (docs.length === 0) continue;

        // Insert into archive
        const archiveDocs = docs.map(doc => ({
          entity_id: eId,
          batch_id: batchId,
          source_collection: Model.collection.collectionName,
          source_id: doc._id,
          period: periodField ? doc[periodField] : (dateField ? `${doc[dateField].getFullYear()}-${String(doc[dateField].getMonth() + 1).padStart(2, '0')}` : ''),
          document: doc,
          archived_at: new Date()
        }));

        // Track periods
        archiveDocs.forEach(d => { if (d.period) periodsSet.add(d.period); });

        await ArchivedDocument.insertMany(archiveDocs, { session });

        // Delete from source
        const ids = docs.map(d => d._id);
        await Model.deleteMany({ _id: { $in: ids } }).session(session);
      }

      // Create batch record
      await ArchiveBatch.create([{
        entity_id: eId,
        batch_id: batchId,
        archived_by: userId,
        cutoff_period: cutoff,
        periods_archived: Array.from(periodsSet).sort(),
        counts,
        total_documents: totalDocs,
        status: 'COMPLETED'
      }], { session });
    });
  } catch (err) {
    // Create failed batch record for audit
    await ArchiveBatch.create({
      entity_id: eId,
      batch_id: batchId,
      archived_by: userId,
      cutoff_period: cutoff,
      periods_archived: [],
      counts: {},
      total_documents: 0,
      status: 'FAILED'
    });
    throw err;
  } finally {
    await session.endSession();
  }

  return {
    batch_id: batchId,
    cutoff_period: cutoff,
    periods_archived: Array.from(periodsSet).sort(),
    counts,
    total_documents: totalDocs
  };
}

/**
 * Restore an archive batch
 */
async function restoreBatch(entityId, batchId, userId, reason) {
  const eId = new mongoose.Types.ObjectId(entityId);

  const batch = await ArchiveBatch.findOne({ entity_id: eId, batch_id: batchId, status: 'COMPLETED' });
  if (!batch) throw Object.assign(new Error('Archive batch not found or already restored'), { statusCode: 404 });

  const archivedDocs = await ArchivedDocument.find({ entity_id: eId, batch_id: batchId }).lean();
  if (archivedDocs.length === 0) throw Object.assign(new Error('No archived documents found'), { statusCode: 404 });

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Group by source collection
      const byCollection = {};
      for (const doc of archivedDocs) {
        if (!byCollection[doc.source_collection]) byCollection[doc.source_collection] = [];
        byCollection[doc.source_collection].push(doc.document);
      }

      // Re-insert into source collections
      for (const [collName, docs] of Object.entries(byCollection)) {
        const collection = mongoose.connection.collection(collName);
        if (docs.length > 0) {
          await collection.insertMany(docs, { session });
        }
      }

      // Remove from archive
      await ArchivedDocument.deleteMany({ entity_id: eId, batch_id: batchId }).session(session);

      // Update batch status
      batch.status = 'RESTORED';
      batch.restored_at = new Date();
      batch.restored_by = userId;
      batch.restore_reason = reason || '';
      await batch.save({ session });
    });
  } finally {
    await session.endSession();
  }

  return { batch_id: batchId, restored_documents: archivedDocs.length };
}

/**
 * List archive batches
 */
async function getArchiveBatches(entityId) {
  return ArchiveBatch.find({ entity_id: new mongoose.Types.ObjectId(entityId) })
    .sort({ archived_at: -1 })
    .lean();
}

/**
 * Get archive batch detail grouped by source collection
 */
async function getArchiveBatchDetail(entityId, batchId) {
  const docs = await ArchivedDocument.find({
    entity_id: new mongoose.Types.ObjectId(entityId),
    batch_id: batchId
  }).select('source_collection source_id period archived_at').lean();

  // Group by collection
  const grouped = {};
  for (const doc of docs) {
    if (!grouped[doc.source_collection]) grouped[doc.source_collection] = [];
    grouped[doc.source_collection].push({
      source_id: doc.source_id,
      period: doc.period,
      archived_at: doc.archived_at
    });
  }

  return { batch_id: batchId, total: docs.length, collections: grouped };
}

module.exports = {
  archivePeriods,
  restoreBatch,
  getArchiveBatches,
  getArchiveBatchDetail
};
