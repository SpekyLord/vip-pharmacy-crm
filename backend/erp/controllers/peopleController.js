const PeopleMaster = require('../models/PeopleMaster');
const CompProfile = require('../models/CompProfile');
const User = require('../../models/User');
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
      .populate('reports_to', 'full_name position')
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
  const entityScope = req.isPresident ? {} : { entity_id: req.entityId };
  const person = await PeopleMaster.findOne({ _id: req.params.id, ...entityScope })
    .select('+government_ids.sss_no +government_ids.philhealth_no +government_ids.pagibig_no +government_ids.tin +bank_account.bank +bank_account.account_no +bank_account.account_name')
    .populate('user_id', 'name email role')
    .populate('reports_to', 'full_name position department')
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
  const entityScope = req.isPresident ? {} : { entity_id: req.entityId };
  const person = await PeopleMaster.findOne({ _id: req.params.id, ...entityScope });
  if (!person) {
    return res.status(404).json({ success: false, message: 'Person not found' });
  }

  const allowed = [
    'full_name', 'first_name', 'last_name', 'person_type', 'position', 'department',
    'reports_to', 'bdm_code', 'role_notes',
    'email', 'phone', 'avatar', 'territory_id', 'bdm_stage',
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
  const entityScope = req.isPresident ? {} : { entity_id: req.entityId };
  const person = await PeopleMaster.findOne({ _id: req.params.id, ...entityScope });
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
    'profit_share_eligible', 'commission_rate',
    'tax_status', 'reason',
  ];

  for (const key of allowed) {
    if (req.body[key] !== undefined) profile[key] = req.body[key];
  }
  profile.set_by = req.user._id;

  await profile.save();
  res.json({ success: true, data: profile });
});

/**
 * POST /people/sync-from-crm — import CRM Users with erp_access.enabled into PeopleMaster
 * Skips users that already have a PeopleMaster record. Creates new records for missing ones.
 */
const syncFromCrm = catchAsync(async (req, res) => {
  // Get all CRM users with ERP access for this entity
  const crmUsers = await User.find({
    entity_id: req.entityId,
    'erp_access.enabled': true
  }).select('_id name email phone role entity_id territory_id avatar bdm_stage').lean();

  // Get existing PeopleMaster records keyed by user_id
  const existing = await PeopleMaster.find({ entity_id: req.entityId }).lean();
  const existingByUserId = new Map(
    existing.filter(p => p.user_id).map(p => [p.user_id.toString(), p])
  );

  let created = 0, updated = 0, skipped = 0;
  const typeMap = { admin: 'EMPLOYEE', president: 'DIRECTOR', employee: 'BDM', medrep: 'SALES_REP', finance: 'EMPLOYEE' };

  for (const u of crmUsers) {
    const existingPerson = existingByUserId.get(u._id.toString());

    if (existingPerson) {
      // Update contact/territory fields from CRM if changed
      const updates = {};
      if (u.email && u.email !== existingPerson.email) updates.email = u.email;
      if (u.phone && u.phone !== existingPerson.phone) updates.phone = u.phone;
      if (u.avatar && u.avatar !== existingPerson.avatar) updates.avatar = u.avatar;
      if (u.territory_id && u.territory_id?.toString() !== existingPerson.territory_id?.toString()) updates.territory_id = u.territory_id;
      if (u.bdm_stage && u.bdm_stage !== existingPerson.bdm_stage) updates.bdm_stage = u.bdm_stage;

      if (Object.keys(updates).length > 0) {
        await PeopleMaster.updateOne({ _id: existingPerson._id }, { $set: updates });
        updated++;
      } else {
        skipped++;
      }
      continue;
    }

    // Parse name
    const nameParts = (u.name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || u.name || 'Unknown';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
    const personType = typeMap[u.role] || 'EMPLOYEE';

    await PeopleMaster.create({
      entity_id: req.entityId,
      user_id: u._id,
      person_type: personType,
      full_name: u.name || 'Unknown',
      first_name: firstName,
      last_name: lastName,
      email: u.email || '',
      phone: u.phone || '',
      avatar: u.avatar || '',
      territory_id: u.territory_id || null,
      bdm_stage: u.bdm_stage || '',
      position: u.role === 'employee' ? 'BDM' : u.role,
      department: u.role === 'employee' ? 'SALES' : 'ADMIN',
      employment_type: 'REGULAR',
      is_active: true
    });
    created++;
  }

  res.json({ success: true, message: `Synced: ${created} created, ${updated} updated, ${skipped} unchanged`, data: { created, updated, skipped, total_crm_users: crmUsers.length } });
});

/**
 * GET /people/as-users — lightweight user list (CRM-compatible shape)
 * Returns { _id, name, role, isActive } from PeopleMaster → User,
 * scoped by entity. Replaces crmApi.get('/users') calls in ERP pages.
 */
const getAsUsers = catchAsync(async (req, res) => {
  // President/CEO sees all entities; others see their own entity
  const filter = { is_active: true };
  if (!req.isPresident) filter.entity_id = req.entityId;
  if (req.query.entity_id) filter.entity_id = req.query.entity_id; // optional override
  if (req.query.role) filter.department = req.query.role; // optional filter

  const people = await PeopleMaster.find(filter)
    .populate('user_id', 'name email role')
    .sort({ full_name: 1 })
    .lean();

  const users = people
    .filter(p => p.user_id)
    .map(p => ({
      _id: p.user_id._id,
      name: p.user_id.name || p.full_name,
      email: p.user_id.email,
      role: p.user_id.role || 'employee',
      isActive: true,
      person_id: p._id,
      full_name: p.full_name,
      department: p.department
    }));

  res.json({ success: true, data: users });
});

// ═══ Org Chart ═══

const getOrgChart = catchAsync(async (req, res) => {
  const Entity = require('../models/Entity');

  // President sees all entities; others see their own
  let entityFilter;
  if (req.isPresident) {
    entityFilter = { status: 'ACTIVE' };
  } else {
    entityFilter = { _id: req.entityId, status: 'ACTIVE' };
  }

  const entities = await Entity.find(entityFilter)
    .select('entity_name short_name entity_type parent_entity_id brand_color')
    .sort({ entity_type: 1, entity_name: 1 })
    .lean();

  const entityIds = entities.map(e => e._id);

  // Get all people across visible entities
  const people = await PeopleMaster.find({ entity_id: { $in: entityIds }, is_active: true })
    .select('full_name position department person_type reports_to bdm_code entity_id')
    .sort({ full_name: 1 })
    .lean();

  // Build per-entity trees
  const entityTree = entities.map(entity => {
    const entityPeople = people.filter(p => p.entity_id.toString() === entity._id.toString());
    const map = new Map(entityPeople.map(p => [p._id.toString(), { ...p, _type: 'person', children: [] }]));
    const roots = [];

    for (const node of map.values()) {
      const parentId = node.reports_to?.toString();
      if (parentId && map.has(parentId)) {
        map.get(parentId).children.push(node);
      } else {
        roots.push(node);
      }
    }

    return {
      _type: 'entity',
      _id: entity._id,
      entity_name: entity.entity_name,
      short_name: entity.short_name,
      entity_type: entity.entity_type,
      parent_entity_id: entity.parent_entity_id,
      brand_color: entity.brand_color,
      people_count: entityPeople.length,
      children: roots,
    };
  });

  res.json({
    success: true,
    data: {
      tree: entityTree,
      total_people: people.length,
      total_entities: entities.length,
    },
  });
});

// ═══ Unified Person + Login Creation ═══

const createPersonUnified = catchAsync(async (req, res) => {
  const {
    first_name, last_name, email, password, phone, role,
    person_type, position, department, employment_type,
    reports_to, territory_id, bdm_stage,
    create_login,
  } = req.body;

  const full_name = `${first_name} ${last_name}`.trim();
  if (!first_name || !last_name) {
    return res.status(400).json({ success: false, message: 'First name and last name are required' });
  }

  let userId = null;

  // Step 1: Create CRM User login if requested
  if (create_login && email && password) {
    // Check email uniqueness
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: `Email "${email}" is already registered` });
    }

    const user = await User.create({
      name: full_name,
      email: email.toLowerCase(),
      password,
      role: role || 'employee',
      phone: phone || '',
      entity_id: req.entityId,
      territory_id: territory_id || null,
      bdm_stage: bdm_stage || '',
      'erp_access.enabled': true,
    });
    userId = user._id;
  }

  // Step 2: Create PeopleMaster record
  const person = await PeopleMaster.create({
    entity_id: req.entityId,
    user_id: userId,
    person_type: person_type || 'EMPLOYEE',
    full_name,
    first_name,
    last_name,
    email: email || '',
    phone: phone || '',
    position: position || '',
    department: department || '',
    employment_type: employment_type || 'REGULAR',
    reports_to: reports_to || null,
    territory_id: territory_id || null,
    bdm_stage: bdm_stage || '',
    is_active: true,
    status: 'ACTIVE',
    created_by: req.user._id,
  });

  res.status(201).json({
    success: true,
    message: userId
      ? `${full_name} created with system login (${email})`
      : `${full_name} created without login`,
    data: person,
  });
});

// ═══ Create Login for Existing Person ═══

const createLoginForPerson = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const person = await PeopleMaster.findById(req.params.id);
  if (!person) return res.status(404).json({ success: false, message: 'Person not found' });
  if (person.user_id) return res.status(400).json({ success: false, message: 'Person already has a system login' });
  if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required' });

  // Check email uniqueness
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return res.status(400).json({ success: false, message: `Email "${email}" is already registered` });

  // Map person_type to CRM role
  const roleMap = { DIRECTOR: 'president', BDM: 'employee', ECOMMERCE_BDM: 'employee', SALES_REP: 'employee', CONSULTANT: 'employee', EMPLOYEE: 'employee' };
  const crmRole = roleMap[person.person_type] || 'employee';

  const user = await User.create({
    name: person.full_name,
    email: email.toLowerCase(),
    password,
    role: crmRole,
    phone: person.phone || '',
    entity_id: person.entity_id,
    territory_id: person.territory_id || null,
    'erp_access.enabled': true,
  });

  // Link PeopleMaster to new CRM User
  person.user_id = user._id;
  if (!person.email) person.email = email;
  await person.save();

  res.status(201).json({
    success: true,
    message: `Login created for ${person.full_name} (${email})`,
    data: { person_id: person._id, user_id: user._id, email },
  });
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
  getAsUsers,
  syncFromCrm,
  getOrgChart,
  createPersonUnified,
  createLoginForPerson,
};
