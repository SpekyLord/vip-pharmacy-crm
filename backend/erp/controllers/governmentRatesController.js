const GovernmentRates = require('../models/GovernmentRates');
const { catchAsync } = require('../../middleware/errorHandler');
const XLSX = require('xlsx');
const { safeXlsxRead } = require('../../utils/safeXlsxRead');

/**
 * GET /api/erp/government-rates
 * List all rates, optionally filtered by rate_type
 */
const getRates = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.rate_type) filter.rate_type = req.query.rate_type;
  if (req.query.active_only === 'true') {
    filter.effective_date = { $lte: new Date() };
    filter.$or = [{ expiry_date: null }, { expiry_date: { $gt: new Date() } }];
  }

  const rates = await GovernmentRates.find(filter).sort({ rate_type: 1, effective_date: -1 }).lean();
  res.json({ success: true, data: rates });
});

/**
 * GET /api/erp/government-rates/:id
 */
const getRateById = catchAsync(async (req, res) => {
  const rate = await GovernmentRates.findById(req.params.id).lean();
  if (!rate) {
    return res.status(404).json({ success: false, message: 'Rate not found' });
  }
  res.json({ success: true, data: rate });
});

/**
 * POST /api/erp/government-rates
 * Create a new rate schedule (admin/finance only)
 */
const createRate = catchAsync(async (req, res) => {
  req.body.set_by = req.user._id;
  const rate = await GovernmentRates.create(req.body);
  res.status(201).json({ success: true, data: rate });
});

/**
 * PUT /api/erp/government-rates/:id
 * Update a rate schedule (admin/finance only)
 */
const updateRate = catchAsync(async (req, res) => {
  const rate = await GovernmentRates.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!rate) {
    return res.status(404).json({ success: false, message: 'Rate not found' });
  }
  res.json({ success: true, data: rate });
});

/**
 * DELETE /api/erp/government-rates/:id
 * Delete a rate schedule (admin only)
 */
const deleteRate = catchAsync(async (req, res) => {
  const rate = await GovernmentRates.findByIdAndDelete(req.params.id);
  if (!rate) {
    return res.status(404).json({ success: false, message: 'Rate not found' });
  }
  res.json({ success: true, message: 'Rate deleted' });
});

/**
 * GET /api/erp/government-rates/export
 * Export all rates to XLSX — one sheet per rate_type (Google Sheets compatible)
 */
const exportRates = catchAsync(async (req, res) => {
  const rates = await GovernmentRates.find().sort({ rate_type: 1, effective_date: -1 }).lean();
  const wb = XLSX.utils.book_new();

  const RATE_TYPES = ['SSS', 'PHILHEALTH', 'PAGIBIG', 'WITHHOLDING_TAX', 'EC', 'DE_MINIMIS'];

  for (const rt of RATE_TYPES) {
    const ratesForType = rates.filter(r => r.rate_type === rt);
    let rows = [];

    for (const rate of ratesForType) {
      const eff = rate.effective_date ? new Date(rate.effective_date).toISOString().slice(0, 10) : '';
      const exp = rate.expiry_date ? new Date(rate.expiry_date).toISOString().slice(0, 10) : '';

      if (rt === 'DE_MINIMIS') {
        for (const bl of (rate.benefit_limits || [])) {
          rows.push({
            'Effective Date': eff, 'Expiry Date': exp,
            'Benefit Code': bl.benefit_code, 'Description': bl.description || '',
            'Limit Amount': bl.limit_amount, 'Limit Period': bl.limit_period || '',
            'Notes': rate.notes || ''
          });
        }
      } else if (['SSS', 'WITHHOLDING_TAX', 'EC'].includes(rt)) {
        for (const b of (rate.brackets || [])) {
          rows.push({
            'Effective Date': eff, 'Expiry Date': exp,
            'Min Salary': b.min_salary, 'Max Salary': b.max_salary || '',
            'Employee Share': b.employee_share, 'Employer Share': b.employer_share,
            'EC': b.ec || 0, 'Notes': rate.notes || ''
          });
        }
      } else {
        rows.push({
          'Effective Date': eff, 'Expiry Date': exp,
          'Flat Rate': rate.flat_rate || '', 'Employee Split': rate.employee_split || '',
          'Employer Split': rate.employer_split || '',
          'Min Contribution': rate.min_contribution || '', 'Max Contribution': rate.max_contribution || '',
          'Notes': rate.notes || ''
        });
      }
    }

    if (!rows.length) rows = [{ Note: 'No data' }];
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = rows[0] ? Object.keys(rows[0]).map(() => ({ wch: 16 })) : [];
    XLSX.utils.book_append_sheet(wb, ws, rt);
  }

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="government-rates-export.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

/**
 * POST /api/erp/government-rates/import
 * Import rates from XLSX — each sheet name maps to rate_type
 */
const importRates = catchAsync(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Upload an Excel file' });
  }

  const wb = safeXlsxRead(req.file.buffer, { type: 'buffer' });
  let created = 0, updated = 0, errors = [];

  for (const sheetName of wb.SheetNames) {
    const rateType = sheetName.trim().toUpperCase();
    if (!['SSS', 'PHILHEALTH', 'PAGIBIG', 'WITHHOLDING_TAX', 'EC', 'DE_MINIMIS'].includes(rateType)) {
      errors.push({ sheet: sheetName, error: `Unknown rate type: ${sheetName}` });
      continue;
    }

    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
    if (!rows.length) continue;

    // Group rows by effective_date
    const groups = {};
    for (const r of rows) {
      const effDate = r['Effective Date'] || r.effective_date || '';
      if (!effDate) { errors.push({ sheet: sheetName, error: 'Row missing Effective Date' }); continue; }
      const key = String(effDate);
      if (!groups[key]) groups[key] = { rows: [], raw: r };
      groups[key].rows.push(r);
    }

    for (const [effKey, group] of Object.entries(groups)) {
      try {
        const effDate = new Date(effKey);
        const expRaw = group.raw['Expiry Date'] || group.raw.expiry_date;
        const expDate = expRaw ? new Date(expRaw) : null;
        const notes = group.raw['Notes'] || group.raw.notes || '';

        const updateData = {
          rate_type: rateType,
          effective_date: effDate,
          expiry_date: expDate,
          notes,
          set_by: req.user._id
        };

        if (rateType === 'DE_MINIMIS') {
          updateData.benefit_limits = group.rows.map(r => ({
            benefit_code: String(r['Benefit Code'] || r.benefit_code || '').trim(),
            description: String(r['Description'] || r.description || '').trim(),
            limit_amount: Number(r['Limit Amount'] || r.limit_amount) || 0,
            limit_period: String(r['Limit Period'] || r.limit_period || 'MONTHLY').trim()
          }));
        } else if (['SSS', 'WITHHOLDING_TAX', 'EC'].includes(rateType)) {
          updateData.brackets = group.rows.map(r => ({
            min_salary: Number(r['Min Salary'] || r.min_salary) || 0,
            max_salary: r['Max Salary'] || r.max_salary ? Number(r['Max Salary'] || r.max_salary) : null,
            employee_share: Number(r['Employee Share'] || r.employee_share) || 0,
            employer_share: Number(r['Employer Share'] || r.employer_share) || 0,
            ec: Number(r['EC'] || r.ec) || 0
          }));
        } else {
          const r = group.rows[0];
          updateData.flat_rate = Number(r['Flat Rate'] || r.flat_rate) || 0;
          updateData.employee_split = Number(r['Employee Split'] || r.employee_split) || 0;
          updateData.employer_split = Number(r['Employer Split'] || r.employer_split) || 0;
          updateData.min_contribution = Number(r['Min Contribution'] || r.min_contribution) || 0;
          updateData.max_contribution = Number(r['Max Contribution'] || r.max_contribution) || 0;
        }

        const result = await GovernmentRates.findOneAndUpdate(
          { rate_type: rateType, effective_date: effDate },
          updateData,
          { upsert: true, new: true }
        );
        if (result.created_at && result.created_at.getTime() > Date.now() - 2000) {
          created++;
        } else {
          updated++;
        }
      } catch (err) {
        errors.push({ sheet: sheetName, effective_date: effKey, error: err.message });
      }
    }
  }

  res.json({
    success: true,
    message: `Import complete: ${created} created, ${updated} updated, ${errors.length} errors`,
    data: { created, updated, errors }
  });
});

/**
 * POST /api/erp/government-rates/compute-breakdown
 * Compute full tax/contribution breakdown for a given monthly salary
 */
const computeBreakdown = catchAsync(async (req, res) => {
  const { monthly_salary = 0, rice_allowance = 0, clothing_allowance = 0, medical_allowance = 0, laundry_allowance = 0 } = req.body;

  // SSS lookup
  const sssRate = await GovernmentRates.getActiveRate('SSS');
  let sss = { ee: 0, er: 0, ec: 0 };
  if (sssRate?.brackets?.length) {
    let bracket = sssRate.brackets[0];
    for (const b of sssRate.brackets) {
      if (monthly_salary >= b.min_salary) bracket = b; else break;
    }
    sss = { ee: bracket.employee_share, er: bracket.employer_share, ec: bracket.ec || 0 };
  }

  // PhilHealth lookup
  const phRate = await GovernmentRates.getActiveRate('PHILHEALTH');
  let ph = { ee: 0, er: 0 };
  if (phRate) {
    const total = Math.min(Math.max(monthly_salary * (phRate.flat_rate || 0), phRate.min_contribution || 0), phRate.max_contribution || Infinity);
    ph = { ee: Math.round(total * (phRate.employee_split || 0.5) * 100) / 100, er: Math.round(total * (phRate.employer_split || 0.5) * 100) / 100 };
  }

  // PagIBIG lookup
  const pagRate = await GovernmentRates.getActiveRate('PAGIBIG');
  let pag = { ee: 0, er: 0 };
  if (pagRate) {
    if (pagRate.brackets?.length) {
      let bracket = pagRate.brackets[0];
      for (const b of pagRate.brackets) {
        if (monthly_salary >= b.min_salary) bracket = b; else break;
      }
      pag = { ee: bracket.employee_share, er: bracket.employer_share };
    } else {
      const total = Math.min(Math.max(monthly_salary * (pagRate.flat_rate || 0), pagRate.min_contribution || 0), pagRate.max_contribution || Infinity);
      pag = { ee: Math.round(total * (pagRate.employee_split || 0.5) * 100) / 100, er: Math.round(total * (pagRate.employer_split || 0.5) * 100) / 100 };
    }
  }

  // De Minimis
  const { computeDeMinimis } = require('../services/deMinimisCalc');
  const deMinimis = await computeDeMinimis({ rice_allowance, clothing_allowance, medical_allowance, laundry_allowance });

  // Withholding Tax
  const annualGross = monthly_salary * 12;
  const annualMandatory = (sss.ee + ph.ee + pag.ee) * 12;
  const annualTaxable = annualGross - annualMandatory - (deMinimis.exempt_total * 12);

  const { computeWithholdingTax } = require('../services/withholdingTaxCalc');
  const wht = await computeWithholdingTax(Math.max(0, annualTaxable));

  const netPay = Math.round((monthly_salary - sss.ee - ph.ee - pag.ee - wht.monthly_tax) * 100) / 100;

  res.json({
    success: true,
    data: {
      monthly_salary,
      sss, philhealth: ph, pagibig: pag,
      total_mandatory_ee: Math.round((sss.ee + ph.ee + pag.ee) * 100) / 100,
      de_minimis: deMinimis,
      annual_taxable: Math.round(annualTaxable * 100) / 100,
      withholding_tax: wht,
      net_pay: netPay
    }
  });
});

module.exports = { getRates, getRateById, createRate, updateRate, deleteRate, exportRates, importRates, computeBreakdown };
