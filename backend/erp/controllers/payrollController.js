const PeopleMaster = require('../models/PeopleMaster');
const Payslip = require('../models/Payslip');
const { catchAsync } = require('../../middleware/errorHandler');
const {
  generateEmployeePayslip,
  generateBdmPayslip,
  generateSalesRepPayslip,
  computeThirteenthMonth: compute13th,
  transitionPayslipStatus,
} = require('../services/payslipCalc');
const { journalFromPayroll, resolveFundingCoa } = require('../services/autoJournal');
const { createAndPostJournal } = require('../services/journalEngine');
const { notifyPayrollPosted } = require('../services/erpNotificationService');

const GENERATOR_MAP = {
  BDM: generateBdmPayslip,
  ECOMMERCE_BDM: generateBdmPayslip,
  EMPLOYEE: generateEmployeePayslip,
  SALES_REP: generateSalesRepPayslip,
  CONSULTANT: generateEmployeePayslip,
  DIRECTOR: generateEmployeePayslip,
};

// ═══ Compute Payroll ═══
const computePayroll = catchAsync(async (req, res) => {
  const { period, cycle = 'MONTHLY' } = req.body;
  if (!period) {
    return res.status(400).json({ success: false, message: 'Period is required (YYYY-MM)' });
  }

  const entityId = req.entityId;
  const people = await PeopleMaster.find({ entity_id: entityId, is_active: true, status: 'ACTIVE' }).lean();

  const results = [];
  const errors = [];

  for (const person of people) {
    try {
      const generator = GENERATOR_MAP[person.person_type] || generateEmployeePayslip;
      const payslip = await generator(entityId, person._id, period, cycle, req.user._id);
      results.push({ person_id: person._id, name: person.full_name, status: 'ok' });
    } catch (err) {
      errors.push({ person_id: person._id, name: person.full_name, error: err.message });
    }
  }

  res.json({
    success: true,
    message: `Computed ${results.length} payslips, ${errors.length} errors`,
    data: { computed: results, errors },
  });
});

// ═══ Get Payroll Staging ═══
const getPayrollStaging = catchAsync(async (req, res) => {
  const filter = { entity_id: req.entityId };
  if (req.query.period) filter.period = req.query.period;
  if (req.query.cycle) filter.cycle = req.query.cycle;
  if (req.query.status) {
    filter.status = req.query.status;
  } else {
    filter.status = { $in: ['COMPUTED', 'REVIEWED', 'APPROVED'] };
  }

  const payslips = await Payslip.find(filter)
    .populate('person_id', 'full_name person_type department')
    .sort({ 'person_id.full_name': 1 })
    .lean();

  // Compute totals
  let totalGross = 0, totalDeductions = 0, totalNet = 0, totalEmployer = 0;
  for (const ps of payslips) {
    totalGross += ps.total_earnings || 0;
    totalDeductions += ps.total_deductions || 0;
    totalNet += ps.net_pay || 0;
    const ec = ps.employer_contributions || {};
    totalEmployer += (ec.sss_employer || 0) + (ec.philhealth_employer || 0) + (ec.pagibig_employer || 0) + (ec.ec_employer || 0);
  }

  res.json({
    success: true,
    data: payslips,
    summary: {
      count: payslips.length,
      total_gross: Math.round(totalGross * 100) / 100,
      total_deductions: Math.round(totalDeductions * 100) / 100,
      total_net: Math.round(totalNet * 100) / 100,
      total_employer: Math.round(totalEmployer * 100) / 100,
    },
  });
});

// ═══ Workflow Actions ═══
const reviewPayslip = catchAsync(async (req, res) => {
  const payslip = await transitionPayslipStatus(req.params.id, 'review', req.user._id);
  res.json({ success: true, data: payslip });
});

const approvePayslip = catchAsync(async (req, res) => {
  const payslip = await transitionPayslipStatus(req.params.id, 'approve', req.user._id);
  res.json({ success: true, data: payslip });
});

const postPayroll = catchAsync(async (req, res) => {
  const { period, cycle = 'MONTHLY' } = req.body;
  const filter = { entity_id: req.entityId, status: 'APPROVED' };
  if (period) filter.period = period;
  if (cycle) filter.cycle = cycle;

  const approved = await Payslip.find(filter);

  // Period lock check — prevent posting payroll to closed periods
  if (period) {
    const { checkPeriodOpen } = require('../utils/periodLock');
    await checkPeriodOpen(req.entityId, period);
  }

  let posted = 0;
  const errors = [];

  for (const ps of approved) {
    try {
      const postedPs = await transitionPayslipStatus(ps._id, 'post', req.user._id);
      posted++;

      // Phase 11: Auto-journal for each posted payslip
      try {
        const fullPs = await Payslip.findById(postedPs._id)
          .populate('person_id', 'full_name')
          .lean();
        const bankCoa = await resolveFundingCoa({ payment_mode: 'BANK_TRANSFER' });
        const jeData = await journalFromPayroll(
          { ...fullPs, employee_name: fullPs.person_id?.full_name || '' },
          bankCoa.coa_code, bankCoa.coa_name, req.user._id
        );
        await createAndPostJournal(fullPs.entity_id, jeData);
      } catch (jeErr) {
        console.error('Auto-journal failed for payslip:', ps._id, jeErr.message);
      }
    } catch (err) {
      errors.push({ payslip_id: ps._id, error: err.message });
    }
  }

  res.json({
    success: true,
    message: `Posted ${posted} payslips, ${errors.length} errors`,
    data: { posted, errors },
  });

  // Non-blocking: notify management of posted payroll
  if (posted > 0) {
    const totalNetPay = approved
      .filter(ps => ps.status === 'POSTED' || true) // all were attempted
      .reduce((sum, ps) => sum + (ps.net_pay || 0), 0);
    notifyPayrollPosted({
      entityId: req.entityId,
      period: period || 'N/A',
      cycle,
      postedCount: posted,
      totalNetPay,
      postedBy: req.user.name || req.user.email,
    }).catch(err => console.error('Payroll post notification failed:', err.message));
  }
});

// ═══ Read ═══
const getPayslip = catchAsync(async (req, res) => {
  const entityScope = req.isPresident ? {} : { entity_id: req.entityId };
  const payslip = await Payslip.findOne({ _id: req.params.id, ...entityScope })
    .populate('person_id', 'full_name person_type department position')
    .populate('reviewed_by', 'name')
    .populate('approved_by', 'name')
    .populate('posted_by', 'name')
    .lean();

  if (!payslip) {
    return res.status(404).json({ success: false, message: 'Payslip not found' });
  }

  res.json({ success: true, data: payslip });
});

const getPayslipHistory = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;

  const filter = { person_id: req.params.personId };
  if (req.query.year) filter.period = { $regex: `^${req.query.year}-` };

  const [payslips, total] = await Promise.all([
    Payslip.find(filter)
      .sort({ period: -1, cycle: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Payslip.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: payslips,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// ═══ 13th Month ═══
const computeThirteenthMonth = catchAsync(async (req, res) => {
  const { year } = req.body;
  if (!year) {
    return res.status(400).json({ success: false, message: 'Year is required' });
  }

  const people = await PeopleMaster.find({ entity_id: req.entityId, is_active: true }).lean();
  const results = [];
  const errors = [];

  for (const person of people) {
    try {
      const ps = await compute13th(req.entityId, person._id, year, req.user._id);
      results.push({ person_id: person._id, name: person.full_name, thirteenth_month: ps.earnings?.thirteenth_month || 0 });
    } catch (err) {
      errors.push({ person_id: person._id, name: person.full_name, error: err.message });
    }
  }

  res.json({
    success: true,
    message: `Computed 13th month for ${results.length} people`,
    data: { results, errors },
  });
});

module.exports = {
  computePayroll,
  getPayrollStaging,
  reviewPayslip,
  approvePayslip,
  postPayroll,
  getPayslip,
  getPayslipHistory,
  computeThirteenthMonth,
};
