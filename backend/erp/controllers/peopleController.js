const PeopleMaster = require('../models/PeopleMaster');
const CompProfile = require('../models/CompProfile');
const { catchAsync } = require('../../middleware/errorHandler');

// ═══ People CRUD ═══

const getPeopleList = catchAsync(async (req, res) => {
  const filter = { ...req.tenantFilter };
  // Remove bdm_id for people list — admin/finance should see all people in entity
  if (req.isAdmin || req.isFinance || req.isPresident) delete filter.bdm_id;

  if (req.query.person_type) filter.person_type = req.query.person_type;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.department) filter.department = req.query.department;
  if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === 'true';
  if (req.query.search) filter.full_name = { $regex: req.query.search, $options: 'i' };

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;

  const [people, total] = await Promise.all([
    PeopleMaster.find(filter)
      .sort({ full_name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user_id', 'name email role')
      .lean(),
    PeopleMaster.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: people,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

const getPersonById = catchAsync(async (req, res) => {
  const person = await PeopleMaster.findById(req.params.id)
    .select('+government_ids.sss_no +government_ids.philhealth_no +government_ids.pagibig_no +government_ids.tin +bank_account.bank +bank_account.account_no +bank_account.account_name')
    .populate('user_id', 'name email role')
    .lean();

  if (!person) {
    return res.status(404).json({ success: false, message: 'Person not found' });
  }

  // Get active comp profile
  const compProfile = await CompProfile.getActiveProfile(person._id);

  // Get comp history
  const compHistory = await CompProfile.find({ person_id: person._id })
    .sort({ effective_date: -1 })
    .limit(10)
    .lean();

  res.json({ success: true, data: { ...person, comp_profile: compProfile, comp_history: compHistory } });
});

const createPerson = catchAsync(async (req, res) => {
  const data = {
    ...req.body,
    entity_id: req.entityId,
    created_by: req.user._id,
  };

  const person = await PeopleMaster.create(data);
  res.status(201).json({ success: true, data: person });
});

const updatePerson = catchAsync(async (req, res) => {
  const person = await PeopleMaster.findById(req.params.id);
  if (!person) {
    return res.status(404).json({ success: false, message: 'Person not found' });
  }

  const allowed = [
    'full_name', 'first_name', 'last_name', 'person_type', 'position', 'department',
    'employment_type', 'date_hired', 'date_regularized', 'date_separated', 'date_of_birth',
    'civil_status', 'government_ids', 'bank_account', 'is_active', 'status', 'user_id',
  ];

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      person[key] = req.body[key];
      if (key === 'government_ids' || key === 'bank_account') person.markModified(key);
    }
  }

  await person.save();
  res.json({ success: true, data: person });
});

const deactivatePerson = catchAsync(async (req, res) => {
  const person = await PeopleMaster.findById(req.params.id);
  if (!person) {
    return res.status(404).json({ success: false, message: 'Person not found' });
  }

  person.is_active = false;
  person.status = 'SEPARATED';
  person.date_separated = new Date();
  await person.save();

  res.json({ success: true, message: 'Person deactivated', data: person });
});

// ═══ Compensation Profile ═══

const getCompProfile = catchAsync(async (req, res) => {
  const profile = await CompProfile.getActiveProfile(req.params.id);
  if (!profile) {
    return res.json({ success: true, data: null, message: 'No active compensation profile' });
  }
  res.json({ success: true, data: profile });
});

const createCompProfile = catchAsync(async (req, res) => {
  // Supersede existing active profile
  await CompProfile.updateMany(
    { person_id: req.params.id, status: 'ACTIVE' },
    { $set: { status: 'SUPERSEDED' } }
  );

  const profile = await CompProfile.create({
    ...req.body,
    person_id: req.params.id,
    entity_id: req.entityId,
    status: 'ACTIVE',
    set_by: req.user._id,
  });

  // Update person's comp_profile_id
  await PeopleMaster.findByIdAndUpdate(req.params.id, { comp_profile_id: profile._id });

  res.status(201).json({ success: true, data: profile });
});

const updateCompProfile = catchAsync(async (req, res) => {
  const profile = await CompProfile.findById(req.params.profileId);
  if (!profile) {
    return res.status(404).json({ success: false, message: 'Compensation profile not found' });
  }
  if (profile.status !== 'ACTIVE') {
    return res.status(400).json({ success: false, message: 'Only active profiles can be edited' });
  }

  const allowed = [
    'salary_type', 'effective_date', 'basic_salary', 'rice_allowance', 'clothing_allowance',
    'medical_allowance', 'laundry_allowance', 'transport_allowance', 'incentive_type',
    'incentive_rate', 'incentive_description', 'incentive_cap', 'perdiem_rate', 'perdiem_days',
    'km_per_liter', 'fuel_overconsumption_threshold', 'smer_eligible',
    'perdiem_engagement_threshold_full', 'perdiem_engagement_threshold_half',
    'logbook_eligible', 'vehicle_type', 'ore_eligible', 'access_eligible', 'crm_linked',
    'tax_status', 'reason',
  ];

  for (const key of allowed) {
    if (req.body[key] !== undefined) profile[key] = req.body[key];
  }
  profile.set_by = req.user._id;

  await profile.save();
  res.json({ success: true, data: profile });
});

module.exports = {
  getPeopleList,
  getPersonById,
  createPerson,
  updatePerson,
  deactivatePerson,
  getCompProfile,
  createCompProfile,
  updateCompProfile,
};
