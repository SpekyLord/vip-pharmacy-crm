/**
 * Depreciation Service — compute, stage, approve, post depreciation
 *
 * PRD v5 §11.9 — Staging pattern:
 *   compute → entries appear in STAGING
 *   approve → Finance marks APPROVED
 *   post → creates JEs via journalEngine
 */
const FixedAsset = require('../models/FixedAsset');
const { createAndPostJournal } = require('./journalEngine');
const { journalFromDepreciation } = require('./autoJournal');

/**
 * Compute monthly depreciation for all ACTIVE assets
 */
async function computeDepreciation(entityId, period) {
  const assets = await FixedAsset.find({ entity_id: entityId, status: 'ACTIVE' });
  const results = [];

  for (const asset of assets) {
    // Check if already computed for this period
    const existing = asset.depreciation_schedule.find(e => e.period === period);
    if (existing) {
      results.push({ asset_code: asset.asset_code, status: 'already_computed', amount: existing.amount });
      continue;
    }

    // Straight-line: (cost - salvage) / useful_life
    const monthlyAmount = Math.round(
      ((asset.acquisition_cost - asset.salvage_value) / asset.useful_life_months) * 100
    ) / 100;

    // Don't exceed remaining depreciable amount
    const remaining = asset.acquisition_cost - asset.salvage_value - asset.accumulated_depreciation;
    const amount = Math.min(monthlyAmount, Math.max(remaining, 0));

    if (amount <= 0) {
      results.push({ asset_code: asset.asset_code, status: 'fully_depreciated', amount: 0 });
      continue;
    }

    asset.depreciation_schedule.push({
      period,
      amount,
      status: 'STAGING'
    });
    await asset.save();

    results.push({ asset_code: asset.asset_code, status: 'computed', amount });
  }

  return results;
}

/**
 * Get depreciation entries in STAGING status for a period
 */
async function getDepreciationStaging(entityId, period) {
  const assets = await FixedAsset.find({
    entity_id: entityId,
    'depreciation_schedule.period': period,
    'depreciation_schedule.status': 'STAGING'
  }).lean();

  return assets.map(a => {
    const entry = a.depreciation_schedule.find(e => e.period === period && e.status === 'STAGING');
    return {
      asset_id: a._id,
      asset_code: a.asset_code,
      asset_name: a.asset_name,
      entry_id: entry._id,
      amount: entry.amount,
      period: entry.period,
      status: entry.status
    };
  });
}

/**
 * Approve depreciation entries
 */
async function approveDepreciation(entityId, entryIds, userId) {
  const assets = await FixedAsset.find({
    entity_id: entityId,
    'depreciation_schedule._id': { $in: entryIds }
  });

  let approved = 0;
  for (const asset of assets) {
    for (const entry of asset.depreciation_schedule) {
      if (entryIds.some(id => id.toString() === entry._id.toString()) && entry.status === 'STAGING') {
        entry.status = 'APPROVED';
        entry.approved_by = userId;
        entry.approved_at = new Date();
        approved++;
      }
    }
    await asset.save();
  }

  return { approved };
}

/**
 * Post approved depreciation entries — creates JEs
 */
async function postDepreciation(entityId, period, userId) {
  const assets = await FixedAsset.find({
    entity_id: entityId,
    'depreciation_schedule.period': period,
    'depreciation_schedule.status': 'APPROVED'
  });

  const posted = [];
  for (const asset of assets) {
    for (const entry of asset.depreciation_schedule) {
      if (entry.period === period && entry.status === 'APPROVED') {
        const jeData = journalFromDepreciation({
          amount: entry.amount,
          date: new Date(),
          period,
          asset_name: asset.asset_name,
          asset_id: asset._id
        }, userId);

        const je = await createAndPostJournal(entityId, jeData);
        entry.status = 'POSTED';
        entry.je_id = je._id;

        // Update accumulated depreciation
        asset.accumulated_depreciation += entry.amount;
        posted.push({ asset_code: asset.asset_code, je_number: je.je_number, amount: entry.amount });
      }
    }
    await asset.save();
  }

  return posted;
}

module.exports = {
  computeDepreciation,
  getDepreciationStaging,
  approveDepreciation,
  postDepreciation
};
