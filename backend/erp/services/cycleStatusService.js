/**
 * Cycle Status Dashboard Service — Payslip cycle progress tracking
 * Phase 14.5
 */
const mongoose = require('mongoose');
const Payslip = require('../models/Payslip');
const PeopleMaster = require('../models/PeopleMaster');

const STATUS_ORDER = ['NOT_STARTED', 'DRAFT', 'COMPUTED', 'REVIEWED', 'APPROVED', 'POSTED'];

/**
 * getCycleStatus — per-BDM payslip status for a period
 */
async function getCycleStatus(entityId, period) {
  const eId = new mongoose.Types.ObjectId(entityId);

  // Get all active people
  const people = await PeopleMaster.find({
    entity_id: eId,
    is_active: true,
    person_type: { $in: ['BDM', 'ECOMMERCE_BDM', 'EMPLOYEE', 'SALES_REP'] }
  }).select('_id user_id full_name person_type').lean();

  // Get payslips for period
  const payslips = await Payslip.find({
    entity_id: eId,
    period
  }).select('person_id status computed_at reviewed_at approved_at posted_at cycle').lean();

  const payslipMap = new Map();
  for (const ps of payslips) {
    const key = ps.person_id.toString();
    // Keep the most advanced status if multiple cycles exist
    const existing = payslipMap.get(key);
    if (!existing || STATUS_ORDER.indexOf(ps.status) > STATUS_ORDER.indexOf(existing.status)) {
      payslipMap.set(key, ps);
    }
  }

  // Determine behind-schedule based on current day of month
  const now = new Date();
  const dayOfMonth = now.getDate();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const isCurrentPeriod = period === currentPeriod;

  const status_counts = { not_started: 0, draft: 0, computed: 0, reviewed: 0, approved: 0, posted: 0 };
  const items = [];
  const behind_schedule_list = [];

  for (const person of people) {
    const ps = payslipMap.get(person._id.toString());
    const payslip_status = ps ? ps.status : 'NOT_STARTED';
    const statusKey = payslip_status.toLowerCase();
    if (status_counts[statusKey] !== undefined) {
      status_counts[statusKey]++;
    } else {
      status_counts.not_started++;
    }

    let behind_schedule = false;
    if (isCurrentPeriod) {
      if (dayOfMonth >= 25 && payslip_status !== 'POSTED') {
        behind_schedule = true;
      } else if (dayOfMonth >= 15 && (payslip_status === 'NOT_STARTED' || payslip_status === 'DRAFT')) {
        behind_schedule = true;
      }
    }

    const item = {
      person_id: person._id,
      bdm_id: person.user_id,
      full_name: person.full_name,
      person_type: person.person_type,
      payslip_status,
      cycle: ps?.cycle || null,
      computed_at: ps?.computed_at || null,
      reviewed_at: ps?.reviewed_at || null,
      approved_at: ps?.approved_at || null,
      posted_at: ps?.posted_at || null,
      behind_schedule
    };

    items.push(item);
    if (behind_schedule) {
      behind_schedule_list.push({ person_id: person._id, full_name: person.full_name, payslip_status });
    }
  }

  // Sort: behind-schedule first, then by status order (least advanced first)
  items.sort((a, b) => {
    if (a.behind_schedule !== b.behind_schedule) return a.behind_schedule ? -1 : 1;
    return STATUS_ORDER.indexOf(a.payslip_status) - STATUS_ORDER.indexOf(b.payslip_status);
  });

  const total_bdms = people.length;
  const completion_pct = total_bdms > 0
    ? Math.round((status_counts.posted / total_bdms) * 10000) / 100
    : 0;

  return {
    period,
    total_bdms,
    status_counts,
    completion_pct,
    items,
    behind_schedule_list
  };
}

module.exports = {
  getCycleStatus
};
