/**
 * CPT Excel Parser
 *
 * Parses the 23-sheet CPT (Call Planning Tool) workbook.
 * See docs/EXCEL_SCHEMA_DOCUMENTATION.md for the exact sheet/column structure.
 *
 * Sheet 1: WEEKLY SUMMARY (aggregated engagement data)
 * Sheet 2: README (documentation)
 * Sheet 3: CALL PLAN - VIP CPT (master doctor list — cols A-AM, rows 9-158)
 * Sheets 4-23: W1D1 through W4D5 (20 day sheets with engagement data)
 */

const XLSX = require('xlsx');

const MAX_WORKBOOK_SHEETS = parseInt(process.env.IMPORT_MAX_WORKBOOK_SHEETS || '30', 10);
const MAX_WORKSHEET_ROWS = parseInt(process.env.IMPORT_MAX_WORKSHEET_ROWS || '2000', 10);

// CPT master sheet column indices (0-based)
const CPT_COLS = {
  ROW_NUM: 0,    // A
  LAST_NAME: 1,  // B
  FIRST_NAME: 2, // C
  SPECIALTY: 3,  // D
  DAY_START: 4,  // E (Day 1)
  DAY_END: 23,   // X (Day 20)
  COUNT: 24,     // Y (auto-calc count of 1s)
  STATUS: 25,    // Z (OK/INVALID/CHECK)
  CLINIC_ADDR: 26,    // AA
  OUTLET: 27,         // AB
  PROGRAMS: 28,       // AC
  SUPPORT: 29,        // AD
  PRODUCT1: 30,       // AE
  PRODUCT2: 31,       // AF
  PRODUCT3: 32,       // AG
  ENGAGEMENT: 33,     // AH
  SEC_NAME: 34,       // AI
  SEC_PHONE: 35,      // AJ
  BIRTHDAY: 36,       // AK
  ANNIVERSARY: 37,    // AL
  OTHER: 38,          // AM
};

// Day sheet column indices (0-based)
const DAY_COLS = {
  LASTNAME: 2,    // C
  FIRSTNAME: 3,   // D
  SPECIALTY: 4,   // E
  FREQ: 5,        // F
  TXT: 6,         // G
  MES: 7,         // H
  PICTURE: 8,     // I
  SIGNED: 9,      // J
  VOICE: 10,      // K
  TOTAL: 11,      // L
  DATE_COVERED: 19, // T
};

// CPT data starts at row 9 (0-indexed = row 8)
const CPT_DATA_START_ROW = 8;
// END sentinel is at row 159 (0-indexed = row 158)
const CPT_END_ROW = 158;

// Day sheet data starts at row 11 (0-indexed = row 10)
const DAY_DATA_START_ROW = 10;
// Day sheet data ends at row 40 (0-indexed = row 39)
const DAY_DATA_END_ROW = 39;

/**
 * Get cell value from a sheet row array, handling undefined
 */
const cellVal = (row, colIndex) => {
  if (!row || colIndex >= row.length) return undefined;
  const val = row[colIndex];
  if (val === undefined || val === null) return undefined;
  return val;
};

/**
 * Get string value from cell, trimmed
 */
const cellStr = (row, colIndex) => {
  const val = cellVal(row, colIndex);
  if (val === undefined || val === null) return '';
  return String(val).trim();
};

/**
 * Parse an Excel date value (serial number or string) to ISO date string
 */
const parseExcelDate = (val) => {
  if (val === undefined || val === null || val === '') return '';

  // If it's a number, it's an Excel serial date
  if (typeof val === 'number') {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed) {
      const month = String(parsed.m).padStart(2, '0');
      const day = String(parsed.d).padStart(2, '0');
      return `${parsed.y}-${month}-${day}`;
    }
  }

  // If it's a Date object
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }

  // Try parsing as string
  const str = String(val).trim();
  if (!str) return '';

  // Try common date formats
  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  // Return as-is if we can't parse it
  return str;
};

/**
 * Parse engagement level from Excel value.
 * Excel stores: "1- The VIP was visited 4 times" → extract leading digit
 */
const parseEngagementLevel = (val) => {
  if (val === undefined || val === null) return null;

  // If already a number
  if (typeof val === 'number') {
    const n = Math.round(val);
    return n >= 1 && n <= 5 ? n : null;
  }

  const str = String(val).trim();
  if (!str) return null;

  // Extract leading digit
  const match = str.match(/^(\d)/);
  if (match) {
    const n = parseInt(match[1], 10);
    return n >= 1 && n <= 5 ? n : null;
  }

  return null;
};

/**
 * Parse the CPT master workbook.
 *
 * @param {Buffer} buffer - Excel file buffer
 * @returns {{ doctors: Array, daySheets: Array, errors: Array }}
 */
const parseCPTWorkbook = (buffer) => {
  const errors = [];

  let workbook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: false,
      dense: true,
      WTF: false,
    });
  } catch (err) {
    errors.push(`Failed to read Excel file: ${err.message}`);
    return { doctors: [], daySheets: [], errors };
  }

  const sheetNames = workbook.SheetNames;
  if (sheetNames.length > MAX_WORKBOOK_SHEETS) {
    errors.push(`Workbook has too many sheets (${sheetNames.length}). Maximum allowed is ${MAX_WORKBOOK_SHEETS}.`);
    return { doctors: [], daySheets: [], errors };
  }

  if (sheetNames.length < 3) {
    errors.push(`Expected at least 3 sheets, found ${sheetNames.length}. This may not be a valid CPT workbook.`);
    return { doctors: [], daySheets: [], errors };
  }

  for (const sheetName of sheetNames) {
    const rowCount = getSheetRowCount(workbook.Sheets[sheetName]);
    if (rowCount > MAX_WORKSHEET_ROWS) {
      errors.push(`Sheet "${sheetName}" has too many rows (${rowCount}). Maximum allowed is ${MAX_WORKSHEET_ROWS}.`);
      return { doctors: [], daySheets: [], errors };
    }
  }

  // Parse master CPT sheet (sheet index 2 = third sheet)
  const doctors = parseCPTMasterSheet(workbook, sheetNames[2], errors);

  // Parse day sheets (sheets 4-23, indices 3-22)
  const daySheets = [];
  for (let i = 0; i < 20; i++) {
    const sheetIndex = i + 3;
    if (sheetIndex < sheetNames.length) {
      const week = Math.floor(i / 5) + 1;
      const day = (i % 5) + 1;
      const label = `W${week} D${day}`;
      const daySheet = parseDaySheet(workbook, sheetNames[sheetIndex], i, label, errors);
      daySheets.push(daySheet);
    }
  }

  return { doctors, daySheets, errors };
};

/**
 * Parse the CPT master sheet (Sheet 3).
 * Reads rows 9 through END sentinel, extracting doctor data.
 */
const parseCPTMasterSheet = (workbook, sheetName, errors) => {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    errors.push(`Master sheet "${sheetName}" not found`);
    return [];
  }

  // Convert to array of arrays for easier row/column access
  const data = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: undefined,
    raw: true,
  });
  const doctors = [];

  for (let rowIdx = CPT_DATA_START_ROW; rowIdx < Math.min(data.length, CPT_END_ROW); rowIdx++) {
    const row = data[rowIdx];
    if (!row) continue;

    const lastName = cellStr(row, CPT_COLS.LAST_NAME);
    const firstName = cellStr(row, CPT_COLS.FIRST_NAME);

    // Skip empty rows or END sentinel
    if (!lastName && !firstName) continue;
    if (lastName.toUpperCase() === 'END') break;

    // Parse day flags (cols E-X, indices 4-23)
    const dayFlags = [];
    let flagCount = 0;
    for (let col = CPT_COLS.DAY_START; col <= CPT_COLS.DAY_END; col++) {
      const val = cellVal(row, col);
      const isSet = val === 1 || val === '1' || val === true;
      dayFlags.push(isSet);
      if (isSet) flagCount++;
    }

    // Determine visit frequency and validation status
    let visitFrequency = flagCount;
    let validationStatus = 'CHECK';

    if (flagCount === 2 || flagCount === 4) {
      visitFrequency = flagCount;
      validationStatus = 'OK';
    } else if (flagCount === 0) {
      visitFrequency = 4; // default
      validationStatus = 'CHECK';
    } else {
      validationStatus = 'INVALID';
    }

    // Check for non-1 values in day columns that aren't blank
    for (let col = CPT_COLS.DAY_START; col <= CPT_COLS.DAY_END; col++) {
      const val = cellVal(row, col);
      if (val !== undefined && val !== null && val !== '' && val !== 1 && val !== '1' && val !== true && val !== 0 && val !== false) {
        validationStatus = 'INVALID';
        break;
      }
    }

    // Parse target products
    const targetProducts = [];
    const p1 = cellStr(row, CPT_COLS.PRODUCT1);
    const p2 = cellStr(row, CPT_COLS.PRODUCT2);
    const p3 = cellStr(row, CPT_COLS.PRODUCT3);
    if (p1) targetProducts.push(p1);
    if (p2) targetProducts.push(p2);
    if (p3) targetProducts.push(p3);

    doctors.push({
      rowNumber: rowIdx - CPT_DATA_START_ROW + 1,
      lastName,
      firstName,
      specialization: cellStr(row, CPT_COLS.SPECIALTY),
      dayFlags,
      visitFrequency,
      validationStatus,
      clinicAddress: cellStr(row, CPT_COLS.CLINIC_ADDR),
      outletIndicator: cellStr(row, CPT_COLS.OUTLET),
      programs: cellStr(row, CPT_COLS.PROGRAMS),
      support: cellStr(row, CPT_COLS.SUPPORT),
      targetProducts,
      engagementLevel: parseEngagementLevel(cellVal(row, CPT_COLS.ENGAGEMENT)),
      secretaryName: cellStr(row, CPT_COLS.SEC_NAME),
      secretaryPhone: cellStr(row, CPT_COLS.SEC_PHONE),
      birthday: parseExcelDate(cellVal(row, CPT_COLS.BIRTHDAY)),
      anniversary: parseExcelDate(cellVal(row, CPT_COLS.ANNIVERSARY)),
      otherDetails: cellStr(row, CPT_COLS.OTHER),
    });
  }

  if (doctors.length === 0) {
    errors.push('No doctor data found in the CPT master sheet. Check that data starts at row 9.');
  }

  return doctors;
};

/**
 * Parse a single day sheet (W1D1 through W4D5).
 * Reads rows 11-40 for doctor engagement data.
 */
const parseDaySheet = (workbook, sheetName, dayIndex, label, errors) => {
  const sheet = workbook.Sheets[sheetName];
  const result = {
    dayIndex,
    label,
    entries: [],
  };

  if (!sheet) {
    // Day sheet may not exist if workbook has fewer sheets
    return result;
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: undefined });

  for (let rowIdx = DAY_DATA_START_ROW; rowIdx <= Math.min(DAY_DATA_END_ROW, data.length - 1); rowIdx++) {
    const row = data[rowIdx];
    if (!row) continue;

    const lastName = cellStr(row, DAY_COLS.LASTNAME);
    if (!lastName) continue; // Skip empty rows

    const firstName = cellStr(row, DAY_COLS.FIRSTNAME);

    result.entries.push({
      lastName,
      firstName,
      engagements: {
        txt: cellVal(row, DAY_COLS.TXT) === 1 || cellVal(row, DAY_COLS.TXT) === '1',
        mes: cellVal(row, DAY_COLS.MES) === 1 || cellVal(row, DAY_COLS.MES) === '1',
        picture: cellVal(row, DAY_COLS.PICTURE) === 1 || cellVal(row, DAY_COLS.PICTURE) === '1',
        signed: cellVal(row, DAY_COLS.SIGNED) === 1 || cellVal(row, DAY_COLS.SIGNED) === '1',
        voice: cellVal(row, DAY_COLS.VOICE) === 1 || cellVal(row, DAY_COLS.VOICE) === '1',
      },
      dateCovered: cellStr(row, DAY_COLS.DATE_COVERED),
    });
  }

  return result;
};

const getSheetRowCount = (sheet) => {
  if (!sheet || !sheet['!ref']) return 0;
  try {
    const range = XLSX.utils.decode_range(sheet['!ref']);
    return range.e.r - range.s.r + 1;
  } catch {
    return 0;
  }
};

/**
 * Detect duplicates between parsed doctors and existing database doctors.
 * Match key: lastName + firstName (case-insensitive, trimmed).
 *
 * @param {Array} parsedDoctors - Doctors parsed from Excel
 * @param {Array} existingDoctors - Doctors from the database (lean objects)
 * @returns {Array} Enriched parsedDoctors with isExisting, existingDoctorId, changes[]
 */
const detectDuplicates = (parsedDoctors, existingDoctors) => {
  // Build lookup map from existing doctors
  const existingMap = new Map();
  for (const doc of existingDoctors) {
    const key = `${(doc.lastName || '').trim().toLowerCase()}_${(doc.firstName || '').trim().toLowerCase()}`;
    existingMap.set(key, doc);
  }

  return parsedDoctors.map((parsed) => {
    const key = `${parsed.lastName.trim().toLowerCase()}_${parsed.firstName.trim().toLowerCase()}`;
    const existing = existingMap.get(key);

    if (!existing) {
      return { ...parsed, isExisting: false, existingDoctorId: null, changes: [] };
    }

    // Build changes list
    const changes = [];

    if (parsed.specialization && parsed.specialization !== (existing.specialization || '')) {
      changes.push(`Specialization: "${existing.specialization || '(empty)'}" → "${parsed.specialization}"`);
    }
    if (parsed.clinicAddress && parsed.clinicAddress !== (existing.clinicOfficeAddress || '')) {
      changes.push(`Address: "${(existing.clinicOfficeAddress || '(empty)').substring(0, 40)}..." → "${parsed.clinicAddress.substring(0, 40)}..."`);
    }
    if (parsed.outletIndicator && parsed.outletIndicator !== (existing.outletIndicator || '')) {
      changes.push(`Outlet: "${existing.outletIndicator || '(empty)'}" → "${parsed.outletIndicator}"`);
    }
    if (parsed.programs && parsed.programs !== (existing.programsToImplement || []).join(', ')) {
      changes.push(`Programs: updated`);
    }
    if (parsed.support && parsed.support !== (existing.supportDuringCoverage || []).join(', ')) {
      changes.push(`Support: updated`);
    }
    if (parsed.engagementLevel && parsed.engagementLevel !== existing.levelOfEngagement) {
      changes.push(`Engagement: ${existing.levelOfEngagement || '(none)'} → ${parsed.engagementLevel}`);
    }
    if (parsed.visitFrequency !== existing.visitFrequency) {
      changes.push(`Frequency: ${existing.visitFrequency}x → ${parsed.visitFrequency}x`);
    }
    if (parsed.secretaryName && parsed.secretaryName !== (existing.secretaryName || '')) {
      changes.push(`Secretary: updated`);
    }
    if (parsed.birthday && parsed.birthday !== '') {
      changes.push(`Birthday: updated`);
    }

    return {
      ...parsed,
      isExisting: true,
      existingDoctorId: existing._id,
      changes,
    };
  });
};

module.exports = {
  parseCPTWorkbook,
  detectDuplicates,
};
