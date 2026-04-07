/**
 * Loan Service — compute interest, stage, approve, post
 *
 * PRD v5 §11.10 — Same staging pattern as depreciation.
 * Monthly interest = outstanding_balance * (annual_rate / 12)
 */
const LoanMaster = require('../models/LoanMaster');
const { createAndPostJournal } = require('./journalEngine');
const { journalFromInterest } = require('./autoJournal');

/**
 * Compute monthly interest for all ACTIVE loans
 */
async function computeInterest(entityId, period) {
  const loans = await LoanMaster.find({ entity_id: entityId, status: 'ACTIVE' });
  const results = [];

  for (const loan of loans) {
    // Check if already computed for this period
    const existing = loan.amortization_schedule.find(e => e.period === period);
    if (existing) {
      results.push({ loan_code: loan.loan_code, status: 'already_computed', interest: existing.interest_amount });
      continue;
    }

    if (loan.outstanding_balance <= 0) {
      results.push({ loan_code: loan.loan_code, status: 'paid', interest: 0 });
      continue;
    }

    const monthlyRate = loan.annual_rate / 12;
    const interestAmount = Math.round(loan.outstanding_balance * monthlyRate * 100) / 100;
    const principalAmount = Math.round(Math.min(loan.monthly_payment - interestAmount, loan.outstanding_balance) * 100) / 100;

    loan.amortization_schedule.push({
      period,
      interest_amount: interestAmount,
      principal_amount: Math.max(principalAmount, 0),
      status: 'STAGING'
    });
    await loan.save();

    results.push({ loan_code: loan.loan_code, status: 'computed', interest: interestAmount, principal: principalAmount });
  }

  return results;
}

/**
 * Get interest entries in STAGING status for a period
 */
async function getInterestStaging(entityId, period) {
  const loans = await LoanMaster.find({
    entity_id: entityId,
    'amortization_schedule.period': period,
    'amortization_schedule.status': 'STAGING'
  }).lean();

  return loans
    .map(l => {
      const entry = l.amortization_schedule.find(e => e.period === period && e.status === 'STAGING');
      if (!entry) return null;
      return {
        loan_id: l._id,
        loan_code: l.loan_code,
        lender: l.lender,
        entry_id: entry._id,
        interest_amount: entry.interest_amount,
        principal_amount: entry.principal_amount,
        outstanding_balance: l.outstanding_balance,
        period: entry.period,
        status: entry.status
      };
    })
    .filter(Boolean);
}

/**
 * Approve interest entries
 */
async function approveInterest(entityId, entryIds, userId) {
  const loans = await LoanMaster.find({
    entity_id: entityId,
    'amortization_schedule._id': { $in: entryIds }
  });

  let approved = 0;
  for (const loan of loans) {
    for (const entry of loan.amortization_schedule) {
      if (entryIds.some(id => id.toString() === entry._id.toString()) && entry.status === 'STAGING') {
        entry.status = 'APPROVED';
        entry.approved_by = userId;
        entry.approved_at = new Date();
        approved++;
      }
    }
    await loan.save();
  }

  return { approved };
}

/**
 * Post approved interest entries — creates JEs
 */
async function postInterest(entityId, period, userId) {
  const loans = await LoanMaster.find({
    entity_id: entityId,
    'amortization_schedule.period': period,
    'amortization_schedule.status': 'APPROVED'
  });

  const posted = [];
  for (const loan of loans) {
    for (const entry of loan.amortization_schedule) {
      if (entry.period === period && entry.status === 'APPROVED') {
        // JE for interest expense
        const jeData = journalFromInterest({
          interest_amount: entry.interest_amount,
          date: new Date(),
          period,
          loan_code: loan.loan_code,
          loan_id: loan._id
        }, userId);

        const je = await createAndPostJournal(entityId, jeData);
        entry.status = 'POSTED';
        entry.je_id = je._id;

        // Reduce outstanding balance by principal portion
        loan.outstanding_balance = Math.round((loan.outstanding_balance - entry.principal_amount) * 100) / 100;
        loan.total_interest += entry.interest_amount;

        if (loan.outstanding_balance <= 0) {
          loan.outstanding_balance = 0;
          loan.status = 'PAID';
        }

        posted.push({ loan_code: loan.loan_code, je_number: je.je_number, interest: entry.interest_amount });
      }
    }
    await loan.save();
  }

  return posted;
}

module.exports = {
  computeInterest,
  getInterestStaging,
  approveInterest,
  postInterest
};
