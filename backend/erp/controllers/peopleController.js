const { ROLES, ALL_ROLES } = require('../../constants/roles');
const PeopleMaster = require('../models/PeopleMaster');
const CompProfile = require('../models/CompProfile');
const FunctionalRoleAssignment = require('../models/FunctionalRoleAssignment');
const User = require('../../models/User');
const Entity = require('../models/Entity');
const JournalEntry = require('../models/JournalEntry');
const AuditLog = require('../../models/AuditLog');
const { catchAsync } = require('../../middleware/errorHandler');
const { resolveEntityScope } = require('../utils/resolveEntityScope');
const { rebuildUserEntityIdsForUser } = require('../utils/userEntityRebuild');

// ═══ People CRUD ═══

const getPeopleList = catchAsync(async (req, res) => {
  // Phase G6 (Apr 26, 2026): respect the entity selector. President-likes used
  // to see every entity's people because tenantFilter is `{}` for them; the
  // working-entity dropdown was effectively a stamp-on-creates affordance,
  // not a true read filter. Master-data lists (People Master) now scope to
  // req.entityId by default; opt-in cross-entity via ?cross_entity=true gated
  // by CROSS_ENTITY_VIEW_ROLES.PEOPLE_MASTER lookup.
  // eslint-disable-next-line vip-tenant/require-entity-filter -- entity scoping handled by resolveEntityScope (lookup-driven, Rule #21 compliant)
  const { entityScope, isCrossEntity, scopedEntityId } = await resolveEntityScope(req, 'PEOPLE_MASTER');
  const filter = { ...entityScope };

  // Phase G7 (Apr 26 2026) — visibility union. When scoped to a single entity,
  // include people whose home is THIS entity OR who have auth-tier span here
  // (User.entity_ids contains scope) OR who hold an active functional role
  // here (FRA.entity_id == scope, load-bearing for User-less people only —
  // FRA-A's userEntityRebuild already folds active FRA entities into
  // User.entity_ids for User-linked people).
  const scopeId = filter.entity_id;
  if (scopeId && !isCrossEntity) {
    const [usersWithSpan, peopleViaFra] = await Promise.all([
      User.find({ entity_ids: scopeId }).select('_id').lean(),
      // eslint-disable-next-line vip-tenant/require-entity-filter -- explicit entity_id scope; FRA query intentionally narrowed to the requested entity
      FunctionalRoleAssignment.find({
        entity_id: scopeId,
        is_active: true,
        status: 'ACTIVE',
      }).select('person_id').lean(),
    ]);
    const userIds = usersWithSpan.map((u) => u._id);
    const fraPersonIds = peopleViaFra.map((f) => f.person_id).filter(Boolean);

    let viaUserPersonIds = [];
    if (userIds.length) {
      // eslint-disable-next-line vip-tenant/require-entity-filter -- intentional cross-entity sweep: maps entity_ids span back to PeopleMaster rows
      const ppl = await PeopleMaster.find({ user_id: { $in: userIds } }).select('_id').lean();
      viaUserPersonIds = ppl.map((p) => p._id);
    }

    const additionalIds = [...viaUserPersonIds, ...fraPersonIds];
    if (additionalIds.length) {
      delete filter.entity_id;
      filter.$or = [{ entity_id: scopeId }, { _id: { $in: additionalIds } }];
    }
  }

  if (req.query.person_type) filter.person_type = req.query.person_type;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.exclude_status) filter.status = { $ne: req.query.exclude_status };
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
      .populate('user_id', 'name email role isActive')
      .populate('reports_to', 'full_name position')
      .populate('territory_id', 'territory_name territory_code')
      .populate('entity_id', 'entity_name short_name brand_color')
      .lean(),
    PeopleMaster.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: people,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    meta: {
      is_cross_entity: isCrossEntity,
      scoped_entity_id: scopedEntityId,
    },
  });
});

const getPersonById = catchAsync(async (req, res) => {
  // Mirror tenantFilter: skip entity_id filter when user has no entity assigned
  const entityScope = req.isPresident ? {} : (req.entityId ? { entity_id: req.entityId } : {});
  const person = await PeopleMaster.findOne({ _id: req.params.id, ...entityScope })
    .select('+government_ids.sss_no +government_ids.philhealth_no +government_ids.pagibig_no +government_ids.tin +bank_account.bank +bank_account.account_no +bank_account.account_name')
    .populate('user_id', 'name email role isActive entity_id entity_ids entity_ids_static')
    .populate('reports_to', 'full_name position department')
    .lean();

  if (!person) {
    return res.status(404).json({ success: false, message: 'Person not found' });
  }

  // Get active comp profile
  const compProfile = await CompProfile.getActiveProfile(person._id);

  // Get comp history
  // eslint-disable-next-line vip-tenant/require-entity-filter -- person_id is unique; person fetched with entityScope above
  const compHistory = await CompProfile.find({ person_id: person._id })
    .sort({ effective_date: -1 })
    .limit(10)
    .lean();

  // Phase G7 (Apr 26 2026) — entity_access summary. Compose Home (PeopleMaster.entity_id),
  // Additional (User.entity_ids_static + active FRAs minus home), and effective set
  // for the UI to render chips without re-querying. Resolves Entity docs in one batch.
  const homeId = person.entity_id ? String(person.entity_id) : null;
  const linkedUser = person.user_id && typeof person.user_id === 'object' ? person.user_id : null;
  const staticIds = (linkedUser?.entity_ids_static || []).map(String);
  const effectiveIds = (linkedUser?.entity_ids || []).map(String);
  // eslint-disable-next-line vip-tenant/require-entity-filter -- by-person sweep; person fetched with entityScope above
  const fraRows = await FunctionalRoleAssignment.find({
    person_id: person._id,
    is_active: true,
    status: 'ACTIVE',
  }).select('entity_id functional_role').lean();
  const fraEntityIds = [...new Set(fraRows.map((r) => String(r.entity_id)).filter(Boolean))];

  const allIds = new Set([homeId, ...staticIds, ...effectiveIds, ...fraEntityIds].filter(Boolean));
  const entityDocs = allIds.size
    ? await Entity.find({ _id: { $in: [...allIds] } }).select('entity_name short_name brand_color').lean()
    : [];
  const entityById = new Map(entityDocs.map((e) => [String(e._id), e]));
  const formatEntity = (id) => {
    const doc = entityById.get(String(id));
    return doc
      ? { _id: doc._id, entity_name: doc.entity_name, short_name: doc.short_name, brand_color: doc.brand_color }
      : { _id: id };
  };
  const additionalIds = [...new Set([...staticIds, ...fraEntityIds])].filter((id) => id !== homeId);
  const entity_access = {
    home: homeId ? formatEntity(homeId) : null,
    additional: additionalIds.map(formatEntity),
    via_static: staticIds.filter((id) => id !== homeId).map(formatEntity),
    via_fra: fraEntityIds.filter((id) => id !== homeId).map(formatEntity),
    effective: [...new Set([homeId, ...effectiveIds].filter(Boolean))].map(formatEntity),
    has_login: !!linkedUser,
  };

  res.json({ success: true, data: { ...person, comp_profile: compProfile, comp_history: compHistory, entity_access } });
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
  const entityScope = req.isPresident ? {} : (req.entityId ? { entity_id: req.entityId } : {});
  const person = await PeopleMaster.findOne({ _id: req.params.id, ...entityScope });
  if (!person) {
    return res.status(404).json({ success: false, message: 'Person not found' });
  }

  const allowed = [
    'full_name', 'first_name', 'last_name', 'person_type', 'position', 'department',
    'reports_to', 'bdm_code', 'role_notes',
    'email', 'phone', 'avatar', 'territory_id', 'bdm_stage',
    'employment_type', 'date_hired', 'date_regularized', 'date_separated', 'date_of_birth', 'live_date',
    'civil_status', 'government_ids', 'bank_account', 'is_active', 'status', 'user_id',
  ];

  // Fields that need empty-string → null conversion (ObjectId refs and dates)
  const dateFields = new Set(['date_hired', 'date_regularized', 'date_separated', 'date_of_birth', 'live_date']);
  const refFields = new Set(['reports_to', 'territory_id', 'user_id']);

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      // Empty strings on date/ref fields → null (Mongoose CastError prevention)
      person[key] = ((dateFields.has(key) || refFields.has(key)) && req.body[key] === '') ? null : req.body[key];
      if (key === 'government_ids' || key === 'bank_account') person.markModified(key);
    }
  }

  await person.save();

  // Sync live_date to linked CRM User (used by salesController for OPENING_AR routing)
  if (req.body.live_date !== undefined && person.user_id) {
    await User.findByIdAndUpdate(person.user_id, { live_date: person.live_date });
  }

  res.json({ success: true, data: person });
});

const deactivatePerson = catchAsync(async (req, res) => {
  const entityScope = req.isPresident ? {} : (req.entityId ? { entity_id: req.entityId } : {});
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

// ─── Separate with cascading effects ───
const separatePerson = catchAsync(async (req, res) => {
  const entityScope = req.isPresident ? {} : (req.entityId ? { entity_id: req.entityId } : {});
  const person = await PeopleMaster.findOne({ _id: req.params.id, ...entityScope });
  if (!person) {
    return res.status(404).json({ success: false, message: 'Person not found' });
  }
  if (person.status === 'SEPARATED' && person.is_active === false) {
    return res.status(400).json({ success: false, message: 'Person is already separated' });
  }

  // 1. Mark person as separated
  person.is_active = false;
  person.status = 'SEPARATED';
  person.date_separated = new Date();
  await person.save();

  // 2. Deactivate all functional role assignments
  // eslint-disable-next-line vip-tenant/require-entity-filter -- person_id is unique; person fetched with entityScope above
  const roleResult = await FunctionalRoleAssignment.updateMany(
    { person_id: person._id, is_active: true },
    { $set: { is_active: false, status: 'REVOKED', updated_by: req.user._id } }
  );

  // 3. Disable CRM login if linked
  let loginDisabled = false;
  if (person.user_id) {
    await User.findByIdAndUpdate(person.user_id, { isActive: false, refreshToken: null });
    loginDisabled = true;
  }

  res.json({
    success: true,
    message: 'Person separated successfully',
    data: {
      person,
      roles_revoked: roleResult.modifiedCount,
      login_disabled: loginDisabled,
    },
  });
});

// ─── Reactivate a separated person ───
const reactivatePerson = catchAsync(async (req, res) => {
  const entityScope = req.isPresident ? {} : (req.entityId ? { entity_id: req.entityId } : {});
  const person = await PeopleMaster.findOne({ _id: req.params.id, ...entityScope });
  if (!person) {
    return res.status(404).json({ success: false, message: 'Person not found' });
  }
  if (person.status !== 'SEPARATED') {
    return res.status(400).json({ success: false, message: 'Person is not separated' });
  }

  person.is_active = true;
  person.status = 'ACTIVE';
  person.date_separated = null;
  await person.save();

  res.json({ success: true, message: 'Person reactivated', data: person });
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
  // Verify the person belongs to caller's entity before mutating their comp profile.
  const entityScope = req.isPresident ? {} : (req.entityId ? { entity_id: req.entityId } : {});
  const person = await PeopleMaster.findOne({ _id: req.params.id, ...entityScope });
  if (!person) {
    return res.status(404).json({ success: false, message: 'Person not found' });
  }

  // Supersede existing active profile (entity-scoped to the person we just verified)
  await CompProfile.updateMany(
    { entity_id: person.entity_id, person_id: person._id, status: 'ACTIVE' },
    { $set: { status: 'SUPERSEDED' } }
  );

  const profile = await CompProfile.create({
    ...req.body,
    person_id: person._id,
    entity_id: person.entity_id,
    status: 'ACTIVE',
    set_by: req.user._id,
  });

  // Update person's comp_profile_id (person already entity-verified above)
  // eslint-disable-next-line vip-tenant/require-entity-filter -- person fetched with entityScope above
  await PeopleMaster.findByIdAndUpdate(person._id, { comp_profile_id: profile._id });

  res.status(201).json({ success: true, data: profile });
});

const updateCompProfile = catchAsync(async (req, res) => {
  const entityScope = req.isPresident ? {} : (req.entityId ? { entity_id: req.entityId } : {});
  const profile = await CompProfile.findOne({ _id: req.params.profileId, ...entityScope });
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
    'km_per_liter', 'fuel_overconsumption_threshold', 'revolving_fund_amount', 'smer_eligible',
    'perdiem_engagement_threshold_full', 'perdiem_engagement_threshold_half',
    'logbook_eligible', 'vehicle_type', 'ore_eligible', 'access_eligible', 'crm_linked',
    'profit_share_eligible', 'commission_rate',
    'consultation_fee_amount', 'consultation_fee_frequency',
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
  }).select('_id name email phone role entity_id territory_id avatar bdm_stage live_date').lean();

  // Get existing PeopleMaster records keyed by user_id
  const existing = await PeopleMaster.find({ entity_id: req.entityId }).lean();
  const existingByUserId = new Map(
    existing.filter(p => p.user_id).map(p => [p.user_id.toString(), p])
  );

  let created = 0, updated = 0, skipped = 0;
  const typeMap = { [ROLES.ADMIN]: 'EMPLOYEE', [ROLES.PRESIDENT]: 'DIRECTOR', [ROLES.CONTRACTOR]: 'BDM', [ROLES.MEDREP]: 'EMPLOYEE', [ROLES.FINANCE]: 'EMPLOYEE' };

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
      if (u.live_date && u.live_date?.toISOString() !== existingPerson.live_date?.toISOString()) updates.live_date = u.live_date;

      if (Object.keys(updates).length > 0) {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- existingPerson._id from same-entity-scoped PeopleMaster.find above (line 265)
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
      live_date: u.live_date || null,
      position: u.role === ROLES.CONTRACTOR ? 'BDM' : u.role,
      department: u.role === ROLES.CONTRACTOR ? 'SALES' : 'ADMIN',
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
  const filter = { is_active: true, status: 'ACTIVE' };
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
      role: p.user_id.role || ROLES.CONTRACTOR,
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
      role: role || ROLES.CONTRACTOR,
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
  const { email, password, template_id } = req.body;
  const entityScope = req.isPresident ? {} : (req.entityId ? { entity_id: req.entityId } : {});
  const person = await PeopleMaster.findOne({ _id: req.params.id, ...entityScope });
  if (!person) return res.status(404).json({ success: false, message: 'Person not found' });
  if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required' });

  // If person already has a linked user, check if it's deactivated — re-enable instead of rejecting
  if (person.user_id) {
    const existingUser = await User.findById(person.user_id);
    if (existingUser && !existingUser.isActive) {
      // Re-enable the existing user: reset password, clear lockout, preserve erp_access
      existingUser.password = password;
      existingUser.isActive = true;
      existingUser.failedLoginAttempts = 0;
      existingUser.lockoutUntil = null;
      existingUser.refreshToken = null;
      if (email) existingUser.email = email.toLowerCase();
      await existingUser.save();

      return res.status(200).json({
        success: true,
        message: `Existing login re-enabled for ${person.full_name} (${existingUser.email}). Password reset. All ERP access preserved.`,
        data: { person_id: person._id, user_id: existingUser._id, email: existingUser.email, reactivated: true },
      });
    }
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Person already has an active system login. Use "Reset Password" to fix login issues.' });
    }
    // existingUser is null (orphaned user_id) — clear the stale link and continue to create new
    person.user_id = null;
  }

  // Check email uniqueness
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return res.status(400).json({ success: false, message: `Email "${email}" is already registered` });

  // Map person_type to CRM role via ROLE_MAPPING lookup (falls back to request body or CONTRACTOR)
  let crmRole = req.body.role || null;
  if (!crmRole) {
    const Lookup = require('../models/Lookup');
    const mapping = await Lookup.findOne({
      entity_id: person.entity_id,
      category: 'ROLE_MAPPING',
      'metadata.person_type': person.person_type,
      is_active: true,
    }).lean();
    crmRole = mapping?.metadata?.system_role || ROLES.CONTRACTOR;
  }
  if (!ALL_ROLES.includes(crmRole)) crmRole = ROLES.CONTRACTOR;

  // Build ERP access — apply template if provided, otherwise just enable
  let erpAccess = { enabled: true };
  if (template_id) {
    const AccessTemplate = require('../models/AccessTemplate');
    // Template must belong to person's entity (ignored for president cross-entity provisioning).
    const tplScope = req.isPresident ? {} : { entity_id: person.entity_id };
    const template = await AccessTemplate.findOne({ _id: template_id, ...tplScope }).lean();
    if (template) {
      erpAccess = {
        enabled: true,
        template_id: template._id,
        modules: { ...template.modules },
        can_approve: template.can_approve || false,
        sub_permissions: template.sub_permissions || {},
        updated_by: req.user._id,
        updated_at: new Date(),
      };
    }
  }

  const user = await User.create({
    name: person.full_name,
    email: email.toLowerCase(),
    password,
    role: crmRole,
    phone: person.phone || '',
    entity_id: person.entity_id,
    territory_id: person.territory_id || null,
    erp_access: erpAccess,
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

// ═══ Disable Login (deactivate CRM User, keep link) ═══

const disableLogin = catchAsync(async (req, res) => {
  const entityScope = req.isPresident ? {} : (req.entityId ? { entity_id: req.entityId } : {});
  const person = await PeopleMaster.findOne({ _id: req.params.id, ...entityScope });
  if (!person) return res.status(404).json({ success: false, message: 'Person not found' });
  if (!person.user_id) return res.status(400).json({ success: false, message: 'Person has no login to disable' });

  await User.findByIdAndUpdate(person.user_id, { $set: { isActive: false } });
  res.json({ success: true, message: `Login disabled for ${person.full_name}. They can no longer log in.` });
});

// ═══ Enable Login (reactivate CRM User) ═══

const enableLogin = catchAsync(async (req, res) => {
  const entityScope = req.isPresident ? {} : (req.entityId ? { entity_id: req.entityId } : {});
  const person = await PeopleMaster.findOne({ _id: req.params.id, ...entityScope });
  if (!person) return res.status(404).json({ success: false, message: 'Person not found' });
  if (!person.user_id) return res.status(400).json({ success: false, message: 'Person has no login to enable' });

  await User.findByIdAndUpdate(person.user_id, { $set: { isActive: true } });
  res.json({ success: true, message: `Login re-enabled for ${person.full_name}.` });
});

// ═══ Unlink Login (disconnect CRM User from PeopleMaster) ═══

const unlinkLogin = catchAsync(async (req, res) => {
  const entityScope = req.isPresident ? {} : (req.entityId ? { entity_id: req.entityId } : {});
  const person = await PeopleMaster.findOne({ _id: req.params.id, ...entityScope });
  if (!person) return res.status(404).json({ success: false, message: 'Person not found' });
  if (!person.user_id) return res.status(400).json({ success: false, message: 'Person has no login to unlink' });

  const userId = person.user_id;
  person.user_id = null;
  await person.save();
  res.json({ success: true, message: `Login unlinked for ${person.full_name}. CRM User ${userId} still exists but is disconnected.` });
});

// ═══ Change System Role (update User.role from PersonDetail) ═══

const changeSystemRole = catchAsync(async (req, res) => {
  const { role } = req.body;
  if (!role) return res.status(400).json({ success: false, message: 'Role is required' });
  if (!ALL_ROLES.includes(role)) {
    return res.status(400).json({ success: false, message: `Invalid role "${role}". Must be one of: ${ALL_ROLES.join(', ')}` });
  }

  const entityScope = req.isPresident ? {} : (req.entityId ? { entity_id: req.entityId } : {});
  const person = await PeopleMaster.findOne({ _id: req.params.id, ...entityScope });
  if (!person) return res.status(404).json({ success: false, message: 'Person not found' });
  if (!person.user_id) return res.status(400).json({ success: false, message: 'Person has no linked login — create one first' });

  const user = await User.findById(person.user_id);
  if (!user) return res.status(404).json({ success: false, message: 'Linked user not found (orphaned reference)' });

  const oldRole = user.role;
  if (oldRole === role) return res.json({ success: true, message: `Role is already "${role}" — no change needed` });

  user.role = role;
  await user.save();

  res.json({
    success: true,
    message: `System role changed from "${oldRole}" to "${role}" for ${person.full_name}`,
    data: { person_id: person._id, user_id: user._id, old_role: oldRole, new_role: role },
  });
});

// ═══ Bulk Change System Role (migrate legacy roles from Control Center) ═══

const bulkChangeSystemRole = catchAsync(async (req, res) => {
  const { from_role, to_role } = req.body;
  if (!from_role || !to_role) return res.status(400).json({ success: false, message: 'Both from_role and to_role are required' });
  if (!ALL_ROLES.includes(from_role)) return res.status(400).json({ success: false, message: `Invalid from_role "${from_role}". Must be one of: ${ALL_ROLES.join(', ')}` });
  if (!ALL_ROLES.includes(to_role)) return res.status(400).json({ success: false, message: `Invalid to_role "${to_role}". Must be one of: ${ALL_ROLES.join(', ')}` });
  if (from_role === to_role) return res.status(400).json({ success: false, message: 'from_role and to_role must be different' });

  const result = await User.updateMany({ role: from_role }, { $set: { role: to_role } });

  res.json({
    success: true,
    message: `Migrated ${result.modifiedCount} user(s) from "${from_role}" to "${to_role}"`,
    data: { from_role, to_role, migrated_count: result.modifiedCount },
  });
});

// ═══ Get legacy role counts (for migration banner) ═══

const getLegacyRoleCounts = catchAsync(async (req, res) => {
  const legacyRoles = ['medrep', 'employee'];
  const counts = {};
  for (const role of legacyRoles) {
    const count = await User.countDocuments({ role });
    if (count > 0) counts[role] = count;
  }
  res.json({ success: true, data: counts });
});

// ═══ Entity Lifecycle (Phase G7, Apr 26 2026) ═══
//
// Three admin/president (or sub-perm-granted staff) actions to manage how a
// person spans entities:
//   - transferEntity → move PeopleMaster.entity_id (home)
//   - grantEntity    → add to User.entity_ids_static (auth-tier span)
//   - revokeEntity   → remove from User.entity_ids_static
//
// Both grant and revoke trigger rebuildUserEntityIdsForUser so the effective
// User.entity_ids reflects union(static, active FRA) — same path FRA-A uses.
// This keeps tenantFilter and resolveOwnerForWrite (Rule #19, Rule #21) honest
// without dual-writing.
//
// Auditing: every mutation writes a PERSON_ENTITY_* row to AuditLog with
// before/after snapshots. Block-on-active-docs uses JournalEntry as the
// canonical financial trail (every posted ERP transaction creates one).
//
// Subscription-readiness (Rule #3): lookback days are per-entity-configurable
// via Lookup PEOPLE_LIFECYCLE_CONFIG / TRANSFER_BLOCK_LOOKBACK_DAYS so future
// SaaS tenants can tune to their operating cadence without a code release.

const DEFAULT_LOOKBACK_DAYS = 90;
const _lookbackCache = new Map();
const LOOKBACK_CACHE_TTL_MS = 5 * 60 * 1000;

async function getActiveDocLookbackDays(entityId) {
  if (!entityId) return DEFAULT_LOOKBACK_DAYS;
  const key = String(entityId);
  const cached = _lookbackCache.get(key);
  if (cached && Date.now() - cached.ts < LOOKBACK_CACHE_TTL_MS) return cached.days;
  let days = DEFAULT_LOOKBACK_DAYS;
  try {
    const Lookup = require('../models/Lookup');
    const doc = await Lookup.findOne({
      entity_id: entityId,
      category: 'PEOPLE_LIFECYCLE_CONFIG',
      code: 'TRANSFER_BLOCK_LOOKBACK_DAYS',
      is_active: true,
    }).lean();
    const v = Number(doc?.metadata?.value);
    if (Number.isFinite(v) && v > 0) days = v;
  } catch (err) {
    console.warn('[peopleController] PEOPLE_LIFECYCLE_CONFIG lookup failed, using default:', err.message);
  }
  _lookbackCache.set(key, { ts: Date.now(), days });
  return days;
}

async function countActivePostedDocs(userId, entityId, lookbackDays) {
  if (!userId || !entityId) return 0;
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  // eslint-disable-next-line vip-tenant/require-entity-filter -- explicit entity_id in filter; sweep intentionally narrow to source entity
  return JournalEntry.countDocuments({
    bdm_id: userId,
    entity_id: entityId,
    status: { $ne: 'DRAFT' },
    createdAt: { $gte: since },
  });
}

const transferEntity = catchAsync(async (req, res) => {
  const { new_entity_id, reason } = req.body || {};
  if (!new_entity_id) {
    return res.status(400).json({ success: false, message: 'new_entity_id is required' });
  }
  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ success: false, message: 'reason is required for audit trail' });
  }

  const sourceScope = req.isPresident ? {} : (req.entityId ? { entity_id: req.entityId } : {});
  const person = await PeopleMaster.findOne({ _id: req.params.id, ...sourceScope });
  if (!person) return res.status(404).json({ success: false, message: 'Person not found' });

  const oldEntityId = person.entity_id ? String(person.entity_id) : null;
  if (String(new_entity_id) === oldEntityId) {
    return res.status(400).json({ success: false, message: 'Person is already in this entity' });
  }

  const newEntity = await Entity.findById(new_entity_id).select('entity_name short_name').lean();
  if (!newEntity) {
    return res.status(400).json({ success: false, message: 'Target entity not found' });
  }

  const lookbackDays = await getActiveDocLookbackDays(oldEntityId || req.entityId);
  if (person.user_id && oldEntityId) {
    const activeCount = await countActivePostedDocs(person.user_id, oldEntityId, lookbackDays);
    if (activeCount > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot transfer: ${activeCount} POSTED document(s) in the source entity within the last ${lookbackDays} days reference this person. Settle, reverse, or wait for them to age out before transferring.`,
        data: { active_doc_count: activeCount, source_entity_id: oldEntityId, lookback_days: lookbackDays },
      });
    }
  }

  person.entity_id = new_entity_id;
  await person.save();

  let userRebuildResult = null;
  if (person.user_id) {
    const linkedUser = await User.findById(person.user_id);
    if (linkedUser) {
      linkedUser.entity_id = new_entity_id;
      const staticSet = new Set((linkedUser.entity_ids_static || []).map(String));
      staticSet.delete(oldEntityId);
      staticSet.add(String(new_entity_id));
      linkedUser.entity_ids_static = [...staticSet];
      await linkedUser.save();
      userRebuildResult = await rebuildUserEntityIdsForUser(linkedUser._id);
    }
  }

  await AuditLog.create({
    action: 'PERSON_ENTITY_TRANSFER',
    userId: req.user._id,
    targetUserId: person.user_id || undefined,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    details: {
      person_id: person._id,
      person_name: person.full_name,
      from_entity_id: oldEntityId,
      to_entity_id: String(new_entity_id),
      to_entity_name: newEntity.short_name || newEntity.entity_name,
      reason: String(reason).trim(),
      user_entity_ids_after: userRebuildResult?.entity_ids || null,
    },
  });

  res.json({
    success: true,
    message: `Transferred to ${newEntity.short_name || newEntity.entity_name}`,
    data: { person_id: person._id, new_entity_id, user_rebuild: userRebuildResult },
  });
});

const grantEntity = catchAsync(async (req, res) => {
  const { entity_id, reason } = req.body || {};
  if (!entity_id) return res.status(400).json({ success: false, message: 'entity_id is required' });
  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ success: false, message: 'reason is required for audit trail' });
  }

  const sourceScope = req.isPresident ? {} : (req.entityId ? { entity_id: req.entityId } : {});
  const person = await PeopleMaster.findOne({ _id: req.params.id, ...sourceScope });
  if (!person) return res.status(404).json({ success: false, message: 'Person not found' });

  if (!person.user_id) {
    return res.status(400).json({
      success: false,
      message: 'Person has no linked login — create a login first, or use Transfer Entity instead. Multi-entity span lives on the User auth record.',
    });
  }

  const targetEntity = await Entity.findById(entity_id).select('entity_name short_name').lean();
  if (!targetEntity) return res.status(400).json({ success: false, message: 'Target entity not found' });

  const linkedUser = await User.findById(person.user_id);
  if (!linkedUser) return res.status(400).json({ success: false, message: 'Linked user not found' });

  const staticSet = new Set((linkedUser.entity_ids_static || []).map(String));
  if (staticSet.has(String(entity_id))) {
    return res.status(200).json({
      success: true,
      message: 'Entity already granted (no change)',
      data: { person_id: person._id, entity_id, no_op: true },
    });
  }
  staticSet.add(String(entity_id));
  linkedUser.entity_ids_static = [...staticSet];
  await linkedUser.save();

  const rebuild = await rebuildUserEntityIdsForUser(linkedUser._id);

  await AuditLog.create({
    action: 'PERSON_ENTITY_GRANT',
    userId: req.user._id,
    targetUserId: linkedUser._id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    details: {
      person_id: person._id,
      person_name: person.full_name,
      entity_id: String(entity_id),
      entity_name: targetEntity.short_name || targetEntity.entity_name,
      reason: String(reason).trim(),
      user_entity_ids_after: rebuild?.entity_ids || null,
    },
  });

  res.json({
    success: true,
    message: `Granted access to ${targetEntity.short_name || targetEntity.entity_name}`,
    data: { person_id: person._id, entity_id, user_rebuild: rebuild },
  });
});

const revokeEntity = catchAsync(async (req, res) => {
  const { entity_id, reason } = req.body || {};
  if (!entity_id) return res.status(400).json({ success: false, message: 'entity_id is required' });
  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ success: false, message: 'reason is required for audit trail' });
  }

  const sourceScope = req.isPresident ? {} : (req.entityId ? { entity_id: req.entityId } : {});
  const person = await PeopleMaster.findOne({ _id: req.params.id, ...sourceScope });
  if (!person) return res.status(404).json({ success: false, message: 'Person not found' });

  if (!person.user_id) {
    return res.status(400).json({
      success: false,
      message: 'Person has no linked login — nothing to revoke. Use Transfer Entity to move the home entity instead.',
    });
  }

  if (String(entity_id) === String(person.entity_id)) {
    return res.status(400).json({
      success: false,
      message: 'Cannot revoke the home entity. Use Transfer Entity to move the home, then revoke if needed.',
    });
  }

  const linkedUser = await User.findById(person.user_id);
  if (!linkedUser) return res.status(400).json({ success: false, message: 'Linked user not found' });

  const staticSet = new Set((linkedUser.entity_ids_static || []).map(String));
  if (!staticSet.has(String(entity_id))) {
    return res.status(200).json({
      success: true,
      message: 'Entity not in static span (no change). Note: active functional roles in this entity will keep it in the effective span until revoked separately.',
      data: { person_id: person._id, entity_id, no_op: true },
    });
  }
  staticSet.delete(String(entity_id));
  linkedUser.entity_ids_static = [...staticSet];
  await linkedUser.save();

  const rebuild = await rebuildUserEntityIdsForUser(linkedUser._id);
  const stillEffective = (rebuild?.entity_ids || []).map(String).includes(String(entity_id));

  const targetEntity = await Entity.findById(entity_id).select('entity_name short_name').lean();

  await AuditLog.create({
    action: 'PERSON_ENTITY_REVOKE',
    userId: req.user._id,
    targetUserId: linkedUser._id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    details: {
      person_id: person._id,
      person_name: person.full_name,
      entity_id: String(entity_id),
      entity_name: targetEntity?.short_name || targetEntity?.entity_name || null,
      reason: String(reason).trim(),
      still_effective_via_fra: stillEffective,
      user_entity_ids_after: rebuild?.entity_ids || null,
    },
  });

  res.json({
    success: true,
    message: stillEffective
      ? `Revoked static grant. Person still has access via active functional role(s) in ${targetEntity?.short_name || 'this entity'} — revoke those to fully remove access.`
      : `Revoked access to ${targetEntity?.short_name || targetEntity?.entity_name || 'entity'}`,
    data: { person_id: person._id, entity_id, still_effective_via_fra: stillEffective, user_rebuild: rebuild },
  });
});

module.exports = {
  getPeopleList,
  getPersonById,
  createPerson,
  updatePerson,
  deactivatePerson,
  separatePerson,
  reactivatePerson,
  getCompProfile,
  createCompProfile,
  updateCompProfile,
  getAsUsers,
  syncFromCrm,
  getOrgChart,
  createPersonUnified,
  createLoginForPerson,
  disableLogin,
  enableLogin,
  unlinkLogin,
  changeSystemRole,
  bulkChangeSystemRole,
  getLegacyRoleCounts,
  transferEntity,
  grantEntity,
  revokeEntity,
};
