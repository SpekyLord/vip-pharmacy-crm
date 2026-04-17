/**
 * Safe Excel Read — ExcelJS-based (replaces safeXlsxRead for parsing untrusted uploads)
 *
 * ExcelJS has no known prototype-pollution or ReDoS vulnerabilities.
 * The SheetJS (xlsx) package remains in the project for export-only usage
 * where data is trusted (server-generated).
 *
 * Usage:
 *   const { safeExcelRead, sheetToArrays, sheetToJson } = require('../utils/safeExcelRead');
 *   const wb = await safeExcelRead(buffer);
 *   const rows = sheetToJson(wb.worksheets[0]);
 */

const ExcelJS = require('exceljs');

// Default max file size: 10 MB (adjustable via env)
const MAX_FILE_SIZE = parseInt(process.env.XLSX_MAX_FILE_SIZE || String(10 * 1024 * 1024), 10);

/**
 * Read an Excel file buffer using ExcelJS.
 * @param {Buffer} buffer - The file buffer
 * @returns {Promise<ExcelJS.Workbook>}
 */
async function safeExcelRead(buffer) {
  const byteLength = Buffer.isBuffer(buffer) ? buffer.length : 0;
  if (byteLength > MAX_FILE_SIZE) {
    throw new Error(
      `Excel file too large (${(byteLength / 1024 / 1024).toFixed(1)} MB). ` +
      `Maximum allowed is ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(1)} MB.`
    );
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

/**
 * Convert a worksheet to an array of arrays (like XLSX.utils.sheet_to_json with header:1).
 * Row/col indices are 0-based. Empty leading rows are preserved as empty arrays.
 *
 * @param {ExcelJS.Worksheet} worksheet
 * @param {object} [opts]
 * @param {boolean} [opts.raw=true] - If true, return raw values; if false, return formatted text
 * @returns {Array<Array>}
 */
function sheetToArrays(worksheet, opts = {}) {
  const raw = opts.raw !== false;
  const result = [];
  const rowCount = worksheet.rowCount;

  for (let r = 1; r <= rowCount; r++) {
    const row = worksheet.getRow(r);
    const values = [];
    for (let c = 1; c <= row.cellCount; c++) {
      const cell = row.getCell(c);
      values.push(raw ? getCellValue(cell) : (cell.text || ''));
    }
    result.push(values);
  }

  return result;
}

/**
 * Convert a worksheet to an array of objects (like XLSX.utils.sheet_to_json).
 * First row is used as headers.
 *
 * @param {ExcelJS.Worksheet} worksheet
 * @param {object} [opts]
 * @param {boolean} [opts.raw=true]
 * @param {*} [opts.defval=''] - Default value for empty cells
 * @returns {Array<object>}
 */
function sheetToJson(worksheet, opts = {}) {
  const raw = opts.raw !== false;
  const defval = opts.defval !== undefined ? opts.defval : '';
  const rowCount = worksheet.rowCount;
  if (rowCount < 2) return [];

  // Read header row
  const headerRow = worksheet.getRow(1);
  const headers = [];
  for (let c = 1; c <= headerRow.cellCount; c++) {
    const val = headerRow.getCell(c).text || '';
    headers.push(val.trim() || `__col${c}`);
  }

  const result = [];
  for (let r = 2; r <= rowCount; r++) {
    const row = worksheet.getRow(r);
    const obj = {};
    let hasValue = false;

    for (let c = 0; c < headers.length; c++) {
      const cell = row.getCell(c + 1);
      const val = raw ? getCellValue(cell) : (cell.text || '');
      obj[headers[c]] = val != null ? val : defval;
      if (val != null && val !== '' && val !== defval) hasValue = true;
    }

    if (hasValue) result.push(obj);
  }

  return result;
}

/**
 * Get a cell's effective value, unwrapping formulas.
 * @param {ExcelJS.Cell} cell
 * @returns {*}
 */
function getCellValue(cell) {
  if (!cell || cell.type === ExcelJS.ValueType.Null) return undefined;

  const val = cell.value;

  // Formula cells: return the result
  if (val && typeof val === 'object') {
    if ('result' in val) return val.result;
    if ('richText' in val) return val.richText.map(r => r.text).join('');
    if (val instanceof Date) return val;
    // Hyperlink
    if ('text' in val) return val.text;
  }

  return val;
}

/**
 * Parse an Excel serial date number to { y, m, d }.
 * Compatible with XLSX.SSF.parse_date_code().
 *
 * @param {number} serial - Excel serial date number
 * @returns {{ y: number, m: number, d: number } | null}
 */
function parseExcelDateCode(serial) {
  if (typeof serial !== 'number' || isNaN(serial)) return null;

  // Excel epoch: Jan 0, 1900 = serial 0
  // Lotus 1-2-3 bug: serial 60 = Feb 29, 1900 (doesn't exist)
  let days = Math.floor(serial);
  if (days > 60) days--; // adjust for Lotus bug

  const epoch = new Date(1899, 11, 31); // Dec 31, 1899
  const date = new Date(epoch.getTime() + days * 86400000);

  return {
    y: date.getFullYear(),
    m: date.getMonth() + 1,
    d: date.getDate()
  };
}

module.exports = { safeExcelRead, sheetToArrays, sheetToJson, parseExcelDateCode, getCellValue };
