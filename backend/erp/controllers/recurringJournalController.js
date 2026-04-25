const RecurringJournalTemplate = require('../models/RecurringJournalTemplate');
const { catchAsync } = require('../../middleware/errorHandler');
const { runDueTemplates, runSingleTemplate, computeNextRunDate } = require('../services/recurringJournalService');
const XLSX = require('xlsx');
const { safeXlsxRead } = require('../../utils/safeXlsxRead');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const listTemplates = catchAsync(async (req, res) => {
  const filter = { entity_id: req.entityId };
  if (req.query.active_only === 'true') filter.is_active = true;
  const templates = await RecurringJournalTemplate.find(filter).sort({ name: 1 }).lean();
  res.json({ success: true, data: templates });
});

const getTemplate = catchAsync(async (req, res) => {
  const tpl = await RecurringJournalTemplate.findOne({ _id: req.params.id, entity_id: req.entityId }).lean();
  if (!tpl) return res.status(404).json({ success: false, message: 'Template not found' });
  res.json({ success: true, data: tpl });
});

const createTemplate = catchAsync(async (req, res) => {
  const { name, description, frequency, day_of_month, lines, auto_post, source_module } = req.body;
  if (!lines?.length || lines.length < 2) {
    return res.status(400).json({ success: false, message: 'At least 2 journal lines required' });
  }

  // Compute initial next_run_date
  const day = Math.min(Math.max(day_of_month || 1, 1), 28);
  const now = new Date();
  let nextRun = new Date(now.getFullYear(), now.getMonth(), day);
  if (nextRun <= now) nextRun = computeNextRunDate(nextRun, frequency || 'MONTHLY');

  const tpl = await RecurringJournalTemplate.create({
    entity_id: req.entityId,
    name, description, frequency, day_of_month: day,
    lines, auto_post: auto_post || false,
    source_module: source_module || 'MANUAL',
    next_run_date: nextRun,
    is_active: true,
    created_by: req.user._id
  });

  res.status(201).json({ success: true, data: tpl });
});

const updateTemplate = catchAsync(async (req, res) => {
  const allowed = ['name', 'description', 'frequency', 'day_of_month', 'lines', 'auto_post', 'source_module', 'is_active'];
  const update = {};
  for (const k of allowed) { if (req.body[k] !== undefined) update[k] = req.body[k]; }

  // Recompute next_run_date if frequency or day changed
  if (update.frequency || update.day_of_month) {
    const existing = await RecurringJournalTemplate.findOne({ _id: req.params.id, entity_id: req.entityId });
    if (existing) {
      const freq = update.frequency || existing.frequency;
      const day = Math.min(Math.max(update.day_of_month || existing.day_of_month, 1), 28);
      const now = new Date();
      let nextRun = new Date(now.getFullYear(), now.getMonth(), day);
      if (nextRun <= now) nextRun = computeNextRunDate(nextRun, freq);
      update.next_run_date = nextRun;
    }
  }

  const tpl = await RecurringJournalTemplate.findOneAndUpdate(
    { _id: req.params.id, entity_id: req.entityId },
    { $set: update },
    { new: true, runValidators: true }
  );
  if (!tpl) return res.status(404).json({ success: false, message: 'Template not found' });
  res.json({ success: true, data: tpl });
});

const deleteTemplate = catchAsync(async (req, res) => {
  const tpl = await RecurringJournalTemplate.findOneAndDelete({ _id: req.params.id, entity_id: req.entityId });
  if (!tpl) return res.status(404).json({ success: false, message: 'Template not found' });
  res.json({ success: true, message: 'Template deleted' });
});

const runNow = catchAsync(async (req, res) => {
  const scopeEntityId = req.isPresident ? null : req.entityId;
  const result = await runSingleTemplate(req.params.id, req.user._id, scopeEntityId);
  res.json({ success: true, data: result });
});

const runAllDue = catchAsync(async (req, res) => {
  const results = await runDueTemplates(req.entityId, req.user._id);
  res.json({ success: true, data: results, message: `${results.filter(r => !r.error).length} templates executed` });
});

const exportTemplates = catchAsync(async (req, res) => {
  const templates = await RecurringJournalTemplate.find({ entity_id: req.entityId }).sort({ name: 1 }).lean();
  const wb = XLSX.utils.book_new();

  // Sheet 1: Templates
  const tplRows = templates.map(t => ({
    'Name': t.name, 'Description': t.description || '',
    'Frequency': t.frequency, 'Day of Month': t.day_of_month,
    'Auto Post': t.auto_post ? 'YES' : 'NO', 'Source Module': t.source_module || 'MANUAL',
    'Active': t.is_active ? 'YES' : 'NO',
    'Next Run': t.next_run_date ? new Date(t.next_run_date).toISOString().slice(0, 10) : '',
    'Last Run': t.last_run_date ? new Date(t.last_run_date).toISOString().slice(0, 10) : ''
  }));
  const ws1 = XLSX.utils.json_to_sheet(tplRows.length ? tplRows : [{ Note: 'No templates' }]);
  ws1['!cols'] = [{ wch: 25 }, { wch: 30 }, { wch: 12 }, { wch: 6 }, { wch: 10 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Templates');

  // Sheet 2: Template Lines
  const lineRows = [];
  for (const t of templates) {
    for (const l of (t.lines || [])) {
      lineRows.push({
        'Template Name': t.name, 'Account Code': l.account_code,
        'Account Name': l.account_name, 'Debit': l.debit || 0,
        'Credit': l.credit || 0, 'Description': l.description || ''
      });
    }
  }
  const ws2 = XLSX.utils.json_to_sheet(lineRows.length ? lineRows : [{ Note: 'No lines' }]);
  ws2['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Template Lines');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="recurring-journal-templates.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

const importTemplates = catchAsync(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Upload an Excel file' });

  const wb = safeXlsxRead(req.file.buffer, { type: 'buffer' });
  const tplSheet = wb.Sheets['Templates'] || wb.Sheets[wb.SheetNames[0]];
  const lineSheet = wb.Sheets['Template Lines'] || wb.Sheets[wb.SheetNames[1]];

  const tplRows = XLSX.utils.sheet_to_json(tplSheet);
  const lineRows = lineSheet ? XLSX.utils.sheet_to_json(lineSheet) : [];

  // Group lines by template name
  const linesByName = {};
  for (const lr of lineRows) {
    const name = String(lr['Template Name'] || '').trim();
    if (!name) continue;
    if (!linesByName[name]) linesByName[name] = [];
    linesByName[name].push({
      account_code: String(lr['Account Code'] || '').trim(),
      account_name: String(lr['Account Name'] || '').trim(),
      debit: Number(lr['Debit']) || 0,
      credit: Number(lr['Credit']) || 0,
      description: String(lr['Description'] || '').trim()
    });
  }

  let created = 0, updated = 0, errors = [];

  for (const tr of tplRows) {
    const name = String(tr['Name'] || '').trim();
    if (!name) { errors.push({ name: '(empty)', error: 'Missing name' }); continue; }

    const lines = linesByName[name] || [];
    const data = {
      entity_id: req.entityId,
      name,
      description: String(tr['Description'] || '').trim(),
      frequency: String(tr['Frequency'] || 'MONTHLY').trim().toUpperCase(),
      day_of_month: Math.min(Math.max(Number(tr['Day of Month']) || 1, 1), 28),
      auto_post: String(tr['Auto Post'] || '').toUpperCase() === 'YES',
      source_module: String(tr['Source Module'] || 'MANUAL').trim(),
      is_active: String(tr['Active'] || 'YES').toUpperCase() !== 'NO',
      lines: lines.length >= 2 ? lines : undefined,
      created_by: req.user._id
    };

    if (!data.lines || data.lines.length < 2) {
      errors.push({ name, error: 'Needs at least 2 lines in "Template Lines" sheet' });
      continue;
    }

    try {
      const existing = await RecurringJournalTemplate.findOne({ entity_id: req.entityId, name });
      if (existing) {
        Object.assign(existing, data);
        await existing.save();
        updated++;
      } else {
        const now = new Date();
        let nextRun = new Date(now.getFullYear(), now.getMonth(), data.day_of_month);
        if (nextRun <= now) nextRun = computeNextRunDate(nextRun, data.frequency);
        data.next_run_date = nextRun;
        await RecurringJournalTemplate.create(data);
        created++;
      }
    } catch (err) {
      errors.push({ name, error: err.message });
    }
  }

  res.json({
    success: true,
    message: `Import complete: ${created} created, ${updated} updated, ${errors.length} errors`,
    data: { created, updated, errors }
  });
});

module.exports = { listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate, runNow, runAllDue, exportTemplates, importTemplates, uploadMiddleware: upload.single('file') };
