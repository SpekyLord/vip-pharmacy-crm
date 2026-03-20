/**
 * Employee Report Export Utility
 *
 * Exports employee visit report to Excel/CSV in the "Call Plan Template" format
 * Uses ACTUAL visit data instead of generated patterns
 */

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

/**
 * Format monthYear for display
 */
const formatMonthYear = (monthYear) => {
  if (!monthYear) return '';
  const [year, month] = monthYear.split('-');
  const date = new Date(year, parseInt(month) - 1);
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
};

/**
 * Build the complete worksheet data from report data
 */
const buildWorksheetData = (reportData, monthYear) => {
  const { employee, summary, areaAssigned, doctors } = reportData;

  // Sort doctors alphabetically by lastName
  const sortedDoctors = [...doctors]
    .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));

  // Day column headers
  const dayHeaders = [
    'mon', 'tue', 'wed', 'thu', 'fri', // Week 1
    'mon', 'tue', 'wed', 'thu', 'fri', // Week 2
    'mon', 'tue', 'wed', 'thu', 'fri', // Week 3
    'mon', 'tue', 'wed', 'thu', 'fri', // Week 4
  ];

  const dayNumbers = [
    '1', '2', '3', '4', '5',
    '6', '7', '8', '9', '10',
    '11', '12', '13', '14', '15',
    '16', '17', '18', '19', '20',
  ];

  // Build worksheet data rows
  const wsData = [];

  // Row 1: Total 2X
  const row1 = [
    'Total No. Of 2X',
    summary.count2x,
    '',
    'Minimum of 20 VIP',
    'Put "1" TWICE if VIP is to be covered twice a month',
    ...Array(15).fill(''),
    '2x',
    '', '', '', '', '', '', '', '',
  ];
  wsData.push(row1);

  // Row 2: Total 4X
  const row2 = [
    'Total No. Of 4X',
    summary.count4x,
    '',
    '',
    'Put "1" FOUR TIMES if VIP is to be covered four times a month',
    ...Array(15).fill(''),
    '4x',
    '', '', '', '', '', '', '', '',
  ];
  wsData.push(row2);

  // Row 3: Total VIP
  const row3 = [
    'Total No. of VIP',
    summary.totalDoctors,
    'Minimum of 130 VIP',
    ...Array(27).fill(''),
  ];
  wsData.push(row3);

  // Row 4: CPT Header with day numbers
  const row4 = [
    'CALL PLANNING TOOL (CPT):',
    '',
    'Month/Year:',
    formatMonthYear(monthYear),
    ...dayNumbers.map((d) => `Day${d}`),
    '', '', '', '', '', '', '', '', '',
  ];
  wsData.push(row4);

  // Row 5: VIP per day counts
  const row5 = [
    '',
    '',
    'VIP CUSTOMER (VIP) per Day:',
    '',
    ...summary.dailyVIPCounts,
    '', '', '', '', '', '', '', '', '',
  ];
  wsData.push(row5);

  // Row 6: Name and Area
  const row6 = [
    'NAME:',
    employee.name,
    'Area Assigned:',
    areaAssigned,
    ...Array(20).fill(''),
    '', '', '', '', '', '', '', '', '',
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
      ...doc.visitGrid, // Actual visit data (0 or 1 for each day)
      doc.visitFrequency || 4, // No. Of
      doc.visitCount, // SUM OF (actual visits logged)
      doc.clinicOfficeAddress || '',
      doc.outletIndicator || '',
      (doc.programsToImplement || []).join(', '),
      (doc.supportDuringCoverage || []).join(', '),
      doc.assignedProducts[0]?.name || '',
      doc.assignedProducts[1]?.name || '',
      doc.assignedProducts[2]?.name || '',
    ];
    wsData.push(dataRow);
  });

  // End row for VIP section
  const endRow = [
    'END', 'END', 'END', 'END',
    ...Array(20).fill('END'),
    'END', 'END', 'END', 'END', 'END', 'END', 'END', 'END', 'END',
  ];
  wsData.push(endRow);

  // EXTRA CALL section — regular client visits below VIP section
  wsData.push([]);
  wsData.push([
    'EXTRA CALL (VIP NOT INCLUDED IN THE LIST)',
    '', '', '', '', '',
    'TYPE OF ENGAGEMENT',
  ]);
  wsData.push([
    'NO.', 'LASTNAME', 'FIRSTNAME', 'SPECIALIZATION', 'ADDRESS', '',
    'TXT/ PROMATS', 'MES/ VIBER GIF', 'PICTURE', 'SIGNED CALL', 'VOICE CALL',
    '', '', 'TOTAL VISITS', 'VISIT DATES',
  ]);

  if (reportData.regularClients && reportData.regularClients.length > 0) {
    const sortedRegulars = [...reportData.regularClients]
      .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));

    sortedRegulars.forEach((client, idx) => {
      const visitDates = (client.visits || [])
        .map(v => new Date(v.visitDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
        .join(', ');

      // Tally engagement types across all visits for this client
      const engagementCounts = { TXT_PROMATS: 0, MES_VIBER_GIF: 0, PICTURE: 0, SIGNED_CALL: 0, VOICE_CALL: 0 };
      (client.visits || []).forEach(v => {
        (v.engagementTypes || []).forEach(et => {
          if (engagementCounts[et] !== undefined) engagementCounts[et]++;
        });
      });

      wsData.push([
        idx + 1,
        client.lastName,
        client.firstName,
        client.specialization || '',
        client.clinicOfficeAddress || '',
        '',
        engagementCounts.TXT_PROMATS || '',
        engagementCounts.MES_VIBER_GIF || '',
        engagementCounts.PICTURE || '',
        engagementCounts.SIGNED_CALL || '',
        engagementCounts.VOICE_CALL || '',
        '', '',
        client.visitCount,
        visitDates,
      ]);
    });
  } else {
    // 5 empty rows for manual entry if no data
    for (let i = 0; i < 5; i++) {
      wsData.push([]);
    }
  }

  return wsData;
};

/**
 * Apply styling to the Excel worksheet
 */
const applyStyles = (ws) => {
  // Set column widths
  const colWidths = [
    { wch: 5 },   // NO.
    { wch: 15 },  // LASTNAME
    { wch: 15 },  // FIRSTNAME
    { wch: 15 },  // VIP SPECIALTY
    ...Array(20).fill({ wch: 5 }), // Day columns
    { wch: 8 },   // No. Of
    { wch: 8 },   // SUM OF
    { wch: 20 },  // CLINIC/OFFICE ADDRESS
    { wch: 15 },  // OUTLET INDICATOR
    { wch: 25 },  // PROGRAMS
    { wch: 20 },  // SUPPORT
    { wch: 15 },  // TARGET PRODUCT 1
    { wch: 15 },  // TARGET PRODUCT 2
    { wch: 15 },  // TARGET PRODUCT 3
  ];
  ws['!cols'] = colWidths;

  return ws;
};

/**
 * Export employee report to Excel file
 */
export const exportEmployeeReportToExcel = (reportData, monthYear) => {
  const wsData = buildWorksheetData(reportData, monthYear);

  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Apply styling
  applyStyles(ws);

  // Add VIP Client worksheet (includes regular clients at bottom)
  XLSX.utils.book_append_sheet(wb, ws, 'BDM Visit Report');

  // Generate filename
  const employeeName = reportData.employee.name.replace(/\s+/g, '_');
  const formattedMonth = formatMonthYear(monthYear).replace(/\s+/g, '_');
  const fileName = `BDM_Report_${employeeName}_${formattedMonth}.xlsx`;

  // Generate file and download
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  saveAs(blob, fileName);
};

/**
 * Export employee report to CSV file
 */
export const exportEmployeeReportToCSV = (reportData, monthYear) => {
  const { employee, doctors } = reportData;

  // Sort doctors alphabetically by lastName
  const sortedDoctors = [...doctors]
    .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));

  // Day column headers
  const dayHeaders = [
    'Day1', 'Day2', 'Day3', 'Day4', 'Day5',
    'Day6', 'Day7', 'Day8', 'Day9', 'Day10',
    'Day11', 'Day12', 'Day13', 'Day14', 'Day15',
    'Day16', 'Day17', 'Day18', 'Day19', 'Day20',
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
    'VISIT_COUNT',
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
      ...doc.visitGrid,
      doc.visitFrequency || 4,
      doc.visitCount,
      doc.clinicOfficeAddress || '',
      doc.outletIndicator || '',
      (doc.programsToImplement || []).join(', '),
      (doc.supportDuringCoverage || []).join(', '),
      doc.assignedProducts[0]?.name || '',
      doc.assignedProducts[1]?.name || '',
      doc.assignedProducts[2]?.name || '',
    ];
    csvData.push(dataRow);
  });

  // Create worksheet and convert to CSV
  const ws = XLSX.utils.aoa_to_sheet(csvData);
  const csv = XLSX.utils.sheet_to_csv(ws);

  // Generate filename
  const employeeName = employee.name.replace(/\s+/g, '_');
  const formattedMonth = formatMonthYear(monthYear).replace(/\s+/g, '_');
  const fileName = `BDM_Report_${employeeName}_${formattedMonth}.csv`;

  // Download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  saveAs(blob, fileName);
};

export default { exportEmployeeReportToExcel, exportEmployeeReportToCSV };
