const Territory = require('../models/Territory');
const { catchAsync } = require('../../middleware/errorHandler');

const getAll = catchAsync(async (req, res) => {
  // Entity scope: non-president users see only their entity's territories.
  // President may pass ?entity_id= to browse cross-entity, or omit it for system-wide.
  const filter = {};
  if (req.isPresident) {
    if (req.query.entity_id) filter.entity_id = req.query.entity_id;
  } else {
    filter.entity_id = req.entityId;
  }
  if (req.query.active_only !== 'false') filter.is_active = true;
  const territories = await Territory.find(filter)
    .populate('assigned_bdms', 'name email')
    .sort({ territory_code: 1 }).lean();
  res.json({ success: true, data: territories });
});

const getById = catchAsync(async (req, res) => {
  // Entity-scope the lookup so a foreign-entity territory _id can't be probed.
  const filter = { _id: req.params.id };
  if (!req.isPresident) filter.entity_id = req.entityId;
  const territory = await Territory.findOne(filter)
    .populate('assigned_bdms', 'name email').lean();
  if (!territory) return res.status(404).json({ success: false, message: 'Territory not found' });
  res.json({ success: true, data: territory });
});

const create = catchAsync(async (req, res) => {
  const territory = await Territory.create(req.body);
  res.status(201).json({ success: true, data: territory });
});

const update = catchAsync(async (req, res) => {
  // Entity-scope the update so a foreign-entity territory can't be silently mutated by id.
  const filter = { _id: req.params.id };
  if (!req.isPresident) filter.entity_id = req.entityId;
  const territory = await Territory.findOneAndUpdate(filter, req.body, { new: true, runValidators: true });
  if (!territory) return res.status(404).json({ success: false, message: 'Territory not found' });
  res.json({ success: true, data: territory });
});

const remove = catchAsync(async (req, res) => {
  // Entity-scope the delete so a foreign-entity territory can't be removed by id.
  const filter = { _id: req.params.id };
  if (!req.isPresident) filter.entity_id = req.entityId;
  const territory = await Territory.findOneAndDelete(filter);
  if (!territory) return res.status(404).json({ success: false, message: 'Territory not found' });
  res.json({ success: true, message: 'Territory deleted' });
});

// Get territory for a specific BDM
const getForBdm = catchAsync(async (req, res) => {
  const code = await Territory.getCodeForBdm(req.params.bdmId || req.bdmId);
  res.json({ success: true, data: { territory_code: code } });
});

module.exports = { getAll, getById, create, update, remove, getForBdm };
