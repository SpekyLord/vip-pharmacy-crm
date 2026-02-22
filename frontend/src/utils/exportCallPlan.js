/**
 * Call Plan Export Utility
 *
 * Exports doctor data to Excel/CSV in the "Call Plan Template" format
 * matching the Montero - Updated Call Plan Template.xlsx structure
 */

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

/**
 * Generate visit pattern for a doctor based on visitFrequency
 * Returns array of 20 elements (Day1-Day20), with "1" or "" for each day
 *
 * @param {number} visitFrequency - 2 or 4 visits per month
 * @param {number} doctorIndex - Index to distribute across weekdays
 * @returns {Array} Array of 20 day values
 */
const generateVisitPattern = (visitFrequency, doctorIndex) => {
  const days = Array(20).fill('');

  // Calculate which weekday this doctor should visit (0-4 for Mon-Fri)
  const weekday = doctorIndex % 5;

  if (visitFrequency === 4) {
    // 4x: Visit same weekday every week (Day 1+weekday, 6+weekday, 11+weekday, 16+weekday)
    // Week 1: Days 1-5, Week 2: Days 6-10, Week 3: Days 11-15, Week 4: Days 16-20
    days[weekday] = 1; // Week 1
    days[5 + weekday] = 1; // Week 2
    days[10 + weekday] = 1; // Week 3
    days[15 + weekday] = 1; // Week 4
  } else if (visitFrequency === 2) {
    // 2x: Visit bi-weekly (Week 1 and Week 3)
    days[weekday] = 1; // Week 1
    days[10 + weekday] = 1; // Week 3
  }

  return days;
};

/**
 * Calculate VIP counts per day column
 */
const calculateDailyVIPCounts = (doctorsWithPatterns) => {
  const counts = Array(20).fill(0);

  doctorsWithPatterns.forEach((doc) => {
    doc.pattern.forEach((val, idx) => {
      if (val === 1) counts[idx]++;
    });
  });

  return counts;
};

/**
 * Get top 3 assigned products for a doctor
 */
const getAssignedProductsForDoctor = (doctorId, assignments) => {
  const doctorAssignments = assignments
    .filter((a) => a.doctor === doctorId || a.doctor?._id === doctorId)
    .sort((a, b) => (a.priority || 3) - (b.priority || 3))
    .slice(0, 3);

  return [
    doctorAssignments[0]?.product?.name || '',
    doctorAssignments[1]?.product?.name || '',
    doctorAssignments[2]?.product?.name || '',
  ];
};

/**
 * Build the complete worksheet data
 */
const buildWorksheetData = (doctors, config) => {
  const { employeeName, areaAssigned, monthYear, assignments = [] } = config;

  // Sort doctors alphabetically by lastName
  const sortedDoctors = [...doctors]
    .map((doc, idx) => {
      const pattern = generateVisitPattern(doc.visitFrequency || 4, idx);
      const products = getAssignedProductsForDoctor(doc._id, assignments);
      return { ...doc, pattern, products };
    })
    .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));

  // Count 2x and 4x doctors
  const count2x = doctors.filter((d) => d.visitFrequency === 2).length;
  const count4x = doctors.filter((d) => d.visitFrequency === 4).length;
  const totalVIP = doctors.length;

  // Calculate daily VIP counts
  const dailyCounts = calculateDailyVIPCounts(sortedDoctors);

  // Day column headers
  const dayHeaders = [
    'mon',
    'tue',
    'wed',
    'thu',
    'fri', // Week 1
    'mon',
    'tue',
    'wed',
    'thu',
    'fri', // Week 2
    'mon',
    'tue',
    'wed',
    'thu',
    'fri', // Week 3
    'mon',
    'tue',
    'wed',
    'thu',
    'fri', // Week 4
  ];

  const dayNumbers = [
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '10',
    '11',
    '12',
    '13',
    '14',
    '15',
    '16',
    '17',
    '18',
    '19',
    '20',
  ];

  // Build worksheet data rows
  const wsData = [];

  // Row 1: Total 2X
  const row1 = [
    'Total No. Of 2X',
    count2x,
    '',
    'Minimum of 20 VIP',
    'Put "1" TWICE if VIP is to be covered twice a month',
    ...Array(15).fill(''),
    '2x',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ];
  wsData.push(row1);

  // Row 2: Total 4X
  const row2 = [
    'Total No. Of 4X',
    count4x,
    '',
    '',
    'Put "1" FOUR TIMES if VIP is to be covered four times a month',
    ...Array(15).fill(''),
    '4x',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ];
  wsData.push(row2);

  // Row 3: Total VIP
  const row3 = [
    'Total No. of VIP',
    totalVIP,
    'Minimum of 130 VIP',
    ...Array(27).fill(''),
  ];
  wsData.push(row3);

  // Row 4: CPT Header with day numbers and VIP counts
  const row4 = [
    'CALL PLANNING TOOL (CPT):',
    '',
    'Month/Year:',
    monthYear,
    ...dayNumbers.map((d, i) => `Day${d}`),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ];
  wsData.push(row4);

  // Row 5: VIP per day counts
  const row5 = [
    '',
    '',
    'VIP CUSTOMER (VIP) per Day:',
    '',
    ...dailyCounts,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ];
  wsData.push(row5);

  // Row 6: Name and Area
  const row6 = [
    'NAME:',
    employeeName,
    'Area Assigned:',
    areaAssigned,
    ...Array(20).fill(''),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ];
  wsData.push(row6);

  // Row 7: Column Headers with day headers
  const headerRow = [
    'NO.',
    'LASTNAME',
    'FIRSTNAME',
    'VIP SPECIALTY',
    ...dayHeaders,
    'No. Of',
    'SUM OF',
    'CLINIC/OFFICE ADDRESS',
    'OUTLET INDICATOR',
    'PROGRAMS TO BE IMPLEMENTED',
    'SUPPORT DURING COVERAGE',
    'TARGET PRODUCT 1',
    'TARGET PRODUCT 2',
    'TARGET PRODUCT 3',
  ];
  wsData.push(headerRow);

  // Data rows
  sortedDoctors.forEach((doc, idx) => {
    const dataRow = [
      idx + 1, // NO.
      doc.lastName,
      doc.firstName,
      doc.specialization || '',
      ...doc.pattern,
      doc.visitFrequency || 4, // No. Of
      doc.visitFrequency || 4, // SUM OF
      doc.clinicOfficeAddress || '',
      doc.outletIndicator || '',
      (doc.programsToImplement || []).join(', '),
      (doc.supportDuringCoverage || []).join(', '),
      doc.products[0],
      doc.products[1],
      doc.products[2],
    ];
    wsData.push(dataRow);
  });

  // End row
  const endRow = [
    'END',
    'END',
    'END',
    'END',
    ...Array(20).fill('END'),
    'END',
    'END',
    'END',
    'END',
    'END',
    'END',
    'END',
    'END',
    'END',
  ];
  wsData.push(endRow);

  return wsData;
};

/**
 * Apply styling to the Excel worksheet
 */
const applyStyles = (ws, dataLength) => {
  // Set column widths
  const colWidths = [
    { wch: 5 }, // NO.
    { wch: 15 }, // LASTNAME
    { wch: 15 }, // FIRSTNAME
    { wch: 15 }, // VIP SPECIALTY
    ...Array(20).fill({ wch: 5 }), // Day columns
    { wch: 8 }, // No. Of
    { wch: 8 }, // SUM OF
    { wch: 20 }, // CLINIC/OFFICE ADDRESS
    { wch: 15 }, // OUTLET INDICATOR
    { wch: 25 }, // PROGRAMS
    { wch: 20 }, // SUPPORT
    { wch: 15 }, // TARGET PRODUCT 1
    { wch: 15 }, // TARGET PRODUCT 2
    { wch: 15 }, // TARGET PRODUCT 3
  ];
  ws['!cols'] = colWidths;

  return ws;
};

/**
 * Export doctors to Excel file
 */
export const exportToExcel = (doctors, config) => {
  const wsData = buildWorksheetData(doctors, config);

  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Apply styling
  applyStyles(ws, doctors.length);

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Call Plan');

  // Generate file and download
  const fileName = `Call_Plan_${config.areaAssigned.replace(/\s+/g, '_')}_${config.monthYear.replace(/\s+/g, '_')}.xlsx`;
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  saveAs(blob, fileName);
};

/**
 * Export doctors to CSV file (simplified format without header summary)
 */
export const exportToCSV = (doctors, config) => {
  const { assignments = [] } = config;

  // Sort doctors alphabetically by lastName
  const sortedDoctors = [...doctors]
    .map((doc, idx) => {
      const pattern = generateVisitPattern(doc.visitFrequency || 4, idx);
      const products = getAssignedProductsForDoctor(doc._id, assignments);
      return { ...doc, pattern, products };
    })
    .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));

  // Day column headers
  const dayHeaders = [
    'Day1',
    'Day2',
    'Day3',
    'Day4',
    'Day5',
    'Day6',
    'Day7',
    'Day8',
    'Day9',
    'Day10',
    'Day11',
    'Day12',
    'Day13',
    'Day14',
    'Day15',
    'Day16',
    'Day17',
    'Day18',
    'Day19',
    'Day20',
  ];

  // Build CSV data
  const csvData = [];

  // Header row
  const headerRow = [
    'NO',
    'LASTNAME',
    'FIRSTNAME',
    'VIP_SPECIALTY',
    ...dayHeaders,
    'FREQUENCY',
    'SUM',
    'CLINIC_ADDRESS',
    'OUTLET_INDICATOR',
    'PROGRAMS',
    'SUPPORT',
    'TARGET_PRODUCT_1',
    'TARGET_PRODUCT_2',
    'TARGET_PRODUCT_3',
  ];
  csvData.push(headerRow);

  // Data rows
  sortedDoctors.forEach((doc, idx) => {
    const dataRow = [
      idx + 1,
      doc.lastName,
      doc.firstName,
      doc.specialization || '',
      ...doc.pattern,
      doc.visitFrequency || 4,
      doc.visitFrequency || 4,
      doc.clinicOfficeAddress || '',
      doc.outletIndicator || '',
      (doc.programsToImplement || []).join(', '),
      (doc.supportDuringCoverage || []).join(', '),
      doc.products[0],
      doc.products[1],
      doc.products[2],
    ];
    csvData.push(dataRow);
  });

  // Create worksheet and convert to CSV
  const ws = XLSX.utils.aoa_to_sheet(csvData);
  const csv = XLSX.utils.sheet_to_csv(ws);

  // Download
  const fileName = `Call_Plan_${config.areaAssigned.replace(/\s+/g, '_')}_${config.monthYear.replace(/\s+/g, '_')}.csv`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  saveAs(blob, fileName);
};

export default { exportToExcel, exportToCSV };
