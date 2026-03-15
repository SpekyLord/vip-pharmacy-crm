/**
 * CPT Workbook Export Utility
 *
 * Generates the full 23-sheet CPT (Call Planning Tool) Excel workbook
 * matching the exact structure documented in docs/EXCEL_SCHEMA_DOCUMENTATION.md.
 *
 * Sheets:
 *   1. WEEKLY SUMMARY — DCR summary (total engagements, targets, call rate)
 *   2. README — linkage documentation
 *   3. CALL PLAN - VIP CPT — master doctor list with day flags + profile fields
 *   4-23. W1 D1 through W4 D5 — 20 daily call report sheets
 */

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

// Day labels for all 20 days
const DAY_LABELS = [];
for (let w = 1; w <= 4; w++) {
  for (let d = 1; d <= 5; d++) {
    DAY_LABELS.push(`W${w} D${d}`);
  }
}

const WEEKDAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri'];

// Engagement level text descriptions
const ENGAGEMENT_TEXTS = [
  '',
  '1- The VIP was visited 4 times',
  '2- The VIP knows the BDM or the product/s',
  '3- The VIP tried the products',
  '4- The VIP is in the group chat (GC)',
  '5- The VIP is an active and established partner',
];

/**
 * Build the WEEKLY SUMMARY sheet (Sheet 1).
 * References engagement data from the 20 day sheets via formulas.
 */
const buildWeeklySummary = (dcrSummary) => {
  const data = [];

  // Row 1: Title (merged later)
  data.push(['DCR SUMMARY – TOTAL ENGAGEMENTS, TARGETS, CALL RATE (W1–W4, D1–D5)', '', '', '', '', '']);

  // Row 2: Empty
  data.push([]);

  // Row 3: Headers
  data.push(['Week', 'Day', 'Sheet', 'Total Engagements', 'Target Engagements', 'Call Rate']);

  // Rows 4-23: Data rows (one per day sheet)
  for (let i = 0; i < 20; i++) {
    const week = Math.floor(i / 5) + 1;
    const day = (i % 5) + 1;
    const sheetName = `W${week} D${day}`;
    const dcr = dcrSummary?.[i] || {};

    data.push([
      `W${week}`,
      `D${day}`,
      sheetName,
      dcr.totalEngagements || 0,
      dcr.targetEngagements || 0,
      dcr.targetEngagements > 0
        ? dcr.totalEngagements / dcr.targetEngagements
        : 0,
    ]);
  }

  // Row 24: Totals
  const totalEngagements = (dcrSummary || []).reduce((s, d) => s + (d.totalEngagements || 0), 0);
  const totalTarget = (dcrSummary || []).reduce((s, d) => s + (d.targetEngagements || 0), 0);
  data.push([
    'TOTAL', '', '',
    totalEngagements,
    totalTarget,
    totalTarget > 0 ? totalEngagements / totalTarget : 0,
  ]);

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Column widths
  ws['!cols'] = [
    { wch: 6 }, { wch: 4 }, { wch: 10 },
    { wch: 20 }, { wch: 20 }, { wch: 12 },
  ];

  return ws;
};

/**
 * Build the README sheet (Sheet 2).
 */
const buildReadme = () => {
  const data = [
    ['Merged and Interconnected Workbook (VIP CPT Flags E..X → DCR Day Sheets)'],
    [''],
    ['Source: CALL PLAN - VIP CPT'],
    ['Rule: Day 1 uses Column E = 1; Day 2 uses Column F = 1; ... Day 20 uses Column X = 1'],
    ['Destination: W1 D1 (Day 1) ... W4 D5 (Day 20)'],
    ['Start cell per destination sheet: C11 (Lastname=C, Firstname=D, VIP Specialty=E)'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 80 }];
  return ws;
};

/**
 * Build the CALL PLAN - VIP CPT master sheet (Sheet 3).
 *
 * @param {Array} doctors - Doctor objects with profile data
 * @param {Array} gridDoctors - Grid data from getCPTGrid (with dayFlags from grid)
 * @param {Object} config - { bdmName, territory, monthYear }
 */
const buildCPTMaster = (doctors, gridDoctors, config) => {
  const { bdmName = '', territory = '', monthYear = '' } = config;

  // Merge doctor profiles with grid data
  const mergedDoctors = buildMergedDoctorList(doctors, gridDoctors);

  // Sort alphabetically by lastName
  mergedDoctors.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));

  // Count 2x and 4x
  const count2x = mergedDoctors.filter((d) => d.visitFrequency === 2).length;
  const count4x = mergedDoctors.filter((d) => d.visitFrequency === 4).length;
  const totalVIP = mergedDoctors.length;

  // Calculate VIP per day counts
  const dailyCounts = Array(20).fill(0);
  mergedDoctors.forEach((doc) => {
    doc.dayFlags.forEach((flag, i) => {
      if (flag) dailyCounts[i]++;
    });
  });

  const data = [];

  // Row 1: Total 2X count
  const row1 = Array(39).fill('');
  row1[0] = 'Total No. Of 2X ';
  row1[2] = count2x;
  data.push(row1);

  // Row 2: Total 4X count
  const row2 = Array(39).fill('');
  row2[0] = 'Total No. Of 4X ';
  row2[2] = count4x;
  row2[3] = 'Minimum of 20 VIP';
  data.push(row2);

  // Row 3: Total VIP
  const row3 = Array(39).fill('');
  row3[0] = 'Total No. of VIP';
  row3[2] = totalVIP;
  row3[3] = 'Minimum of 130 VIP';
  data.push(row3);

  // Row 4: CPT header + day numbers
  const row4 = Array(39).fill('');
  row4[0] = 'CALL PLANNING TOOL (CPT) :';
  row4[2] = 'Month/Year:';
  row4[3] = monthYear;
  for (let i = 0; i < 20; i++) {
    row4[4 + i] = `Day${i + 1}`;
  }
  data.push(row4);

  // Row 5: VIP per day counts
  const row5 = Array(39).fill('');
  row5[2] = 'VIP CUSTOMER (VIP) per Day :';
  for (let i = 0; i < 20; i++) {
    row5[4 + i] = dailyCounts[i];
  }
  data.push(row5);

  // Row 6: Name and Territory
  const row6 = Array(39).fill('');
  row6[0] = 'NAME:';
  row6[1] = bdmName;
  row6[2] = 'Teritorry';
  row6[3] = territory;
  data.push(row6);

  // Row 7: Column type indicators
  const row7 = Array(39).fill('');
  row7[0] = 'NO.';
  row7[1] = 'In Alphabetical Order';
  row7[2] = 'Free Input';
  row7[3] = 'Free Input';
  for (let w = 0; w < 4; w++) {
    for (let d = 0; d < 5; d++) {
      row7[4 + w * 5 + d] = WEEKDAY_NAMES[d];
    }
  }
  row7[24] = 'Auto';
  row7[25] = 'Auto';
  row7[26] = 'Free Input';
  row7[27] = 'Free Input';
  row7[28] = 'DROP DOWN';
  row7[29] = 'DROP DOWN';
  row7[33] = 'DROP DOWN';
  data.push(row7);

  // Row 8: Column headers
  const row8 = Array(39).fill('');
  row8[0] = '';
  row8[1] = 'LASTNAME';
  row8[2] = 'FIRSTNAME';
  row8[3] = 'VIP SPECIALTY';
  // E-X are day flag columns (no header needed)
  row8[24] = 'Count';
  row8[25] = 'Status';
  row8[26] = 'CLINIC/ OFFICE ADDRESS';
  row8[27] = 'OUTLET INDICATOR';
  row8[28] = 'PROGRAMS TO BE IMPLEMENTED';
  row8[29] = 'SUPPORT DURING COVERAGE';
  row8[30] = 'TARGET PRODUCT 1';
  row8[31] = 'TARGET PRODUCT 2';
  row8[32] = 'TARGET PRODUCT 3';
  row8[33] = 'LEVEL OF ENGAGEMENT';
  row8[34] = 'NAME OF SECRETARY';
  row8[35] = 'CP # OF SECRETARY';
  row8[36] = 'BIRTHDAY';
  row8[37] = 'ANNIVERSARY';
  row8[38] = 'OTHER DETAILS';
  data.push(row8);

  // Data rows (rows 9-158, 150 slots)
  for (let i = 0; i < 150; i++) {
    const row = Array(39).fill('');

    if (i < mergedDoctors.length) {
      const doc = mergedDoctors[i];
      row[0] = i + 1; // Row number
      row[1] = doc.lastName || '';
      row[2] = doc.firstName || '';
      row[3] = doc.specialization || '';

      // Day flags
      let flagCount = 0;
      doc.dayFlags.forEach((flag, j) => {
        row[4 + j] = flag ? 1 : '';
        if (flag) flagCount++;
      });

      // Count and status
      row[24] = flagCount;
      if (flagCount === 2 || flagCount === 4) {
        row[25] = 'OK';
      } else if (flagCount === 0) {
        row[25] = 'CHECK';
      } else {
        row[25] = 'CHECK';
      }

      // Profile fields
      row[26] = doc.clinicOfficeAddress || '';
      row[27] = doc.outletIndicator || '';
      row[28] = doc.programs || '';
      row[29] = doc.support || '';
      row[30] = doc.targetProduct1 || '';
      row[31] = doc.targetProduct2 || '';
      row[32] = doc.targetProduct3 || '';
      row[33] = doc.engagementLevel ? ENGAGEMENT_TEXTS[doc.engagementLevel] || '' : '';
      row[34] = doc.secretaryName || '';
      row[35] = doc.secretaryPhone || '';
      row[36] = doc.birthday || '';
      row[37] = doc.anniversary || '';
      row[38] = doc.otherDetails || '';
    } else {
      // Empty placeholder row (formulas would go in Y/Z)
      row[24] = 0;
      row[25] = 'CHECK';
    }

    data.push(row);
  }

  // Row 159: END sentinel
  const endRow = Array(39).fill('END');
  data.push(endRow);

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Column widths
  const colWidths = [
    { wch: 5 },   // A - NO.
    { wch: 16 },  // B - LASTNAME
    { wch: 16 },  // C - FIRSTNAME
    { wch: 14 },  // D - SPECIALTY
    ...Array(20).fill({ wch: 5 }), // E-X day flags
    { wch: 6 },   // Y - Count
    { wch: 8 },   // Z - Status
    { wch: 25 },  // AA - Address
    { wch: 14 },  // AB - Outlet
    { wch: 28 },  // AC - Programs
    { wch: 20 },  // AD - Support
    { wch: 14 },  // AE - Product 1
    { wch: 14 },  // AF - Product 2
    { wch: 14 },  // AG - Product 3
    { wch: 35 },  // AH - Engagement
    { wch: 16 },  // AI - Secretary name
    { wch: 16 },  // AJ - Secretary phone
    { wch: 12 },  // AK - Birthday
    { wch: 12 },  // AL - Anniversary
    { wch: 20 },  // AM - Other
  ];
  ws['!cols'] = colWidths;

  return ws;
};

/**
 * Build a single day sheet (W1D1 through W4D5).
 *
 * @param {number} dayIndex - 0-19
 * @param {Array} allDoctors - Merged doctor list with dayFlags
 * @param {Object} dcrDay - DCR summary for this day
 * @param {Array} extraCallsDay - Extra calls data for this day
 */
const buildDaySheet = (dayIndex, allDoctors, dcrDay, extraCallsDay) => {
  const week = Math.floor(dayIndex / 5) + 1;
  const day = (dayIndex % 5) + 1;

  // Filter doctors scheduled for this day
  const dayDoctors = allDoctors
    .filter((d) => d.dayFlags[dayIndex])
    .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));

  const data = [];

  // Row 1: Company name
  data.push(['VIOS INTEGRATED PROJECTS (VIP) INC.', ...Array(19).fill('')]);
  // Row 2: DCR title
  data.push(['DAILY CALL REPORT (DCR)', ...Array(19).fill('')]);
  // Row 3: BDM
  data.push(['BDM:', '', ...Array(18).fill('')]);
  // Row 4: Area
  data.push(['Area:', '', ...Array(18).fill('')]);
  // Row 5: Week and Day
  const row5 = Array(20).fill('');
  row5[0] = 'Week: ';
  row5[1] = week;
  row5[2] = `Day: ${day}`;
  data.push(row5);
  // Row 6: Date
  data.push(['Date:', '', ...Array(18).fill('')]);
  // Row 7: Instruction
  data.push(['Type "1" for each type of engagement', ...Array(19).fill('')]);

  // Row 8: Main headers
  const row8 = Array(20).fill('');
  row8[0] = 'COUNT';
  row8[2] = 'Name of VIP Customer';
  row8[4] = 'Splty';
  row8[5] = 'FREQ';
  row8[6] = 'TYPE OF ENGAGEMENT';
  row8[11] = 'TOTAL';
  row8[15] = "DM's Signature";
  row8[19] = 'DATE';
  data.push(row8);

  // Row 9: Sub-headers
  const row9 = Array(20).fill('');
  row9[6] = 'TXT/ PROMATS';
  row9[7] = 'MES/ VIBER GIF';
  row9[8] = 'PICTURE';
  row9[9] = 'SIGNED CALL';
  row9[10] = 'VOICE CALL';
  row9[19] = 'COVERED';
  data.push(row9);

  // Row 10: Date format note
  const row10 = Array(20).fill('');
  row10[19] = 'mm/dd/yy';
  data.push(row10);

  // Rows 11-40: Doctor data (30 slots)
  for (let i = 0; i < 30; i++) {
    const row = Array(20).fill('');

    if (i < dayDoctors.length) {
      const doc = dayDoctors[i];
      row[0] = i + 1; // Count
      // B is empty spacer
      row[2] = doc.lastName || '';
      row[3] = doc.firstName || '';
      row[4] = doc.specialization || '';
      row[5] = doc.visitFrequency || '';

      // Engagement data from grid
      const gridCell = doc.grid?.[dayIndex];
      if (gridCell && gridCell.status === 'completed') {
        const et = gridCell.engagementTypes || [];
        row[6] = et.includes('TXT_PROMATS') ? 1 : '';
        row[7] = et.includes('MES_VIBER_GIF') ? 1 : '';
        row[8] = et.includes('PICTURE') ? 1 : '';
        row[9] = et.includes('SIGNED_CALL') ? 1 : '';
        row[10] = et.includes('VOICE_CALL') ? 1 : '';

        // Total
        const total = [row[6], row[7], row[8], row[9], row[10]].filter((v) => v === 1).length;
        row[11] = total || '';

        // Date covered
        row[19] = 'OK';
      }
    }

    data.push(row);
  }

  // Row 41: Total engagements
  const row41 = Array(20).fill('');
  row41[0] = 'TOTAL NUMBER OF ENGAGEMENTS:';
  row41[11] = dcrDay?.totalEngagements || 0;
  data.push(row41);

  // Row 42: Target engagements
  const row42 = Array(20).fill('');
  row42[0] = 'TARGET NUMBER OF ENGAGEMENTS:';
  row42[11] = dcrDay?.targetEngagements || dayDoctors.length;
  data.push(row42);

  // Row 43: Call rate
  const row43 = Array(20).fill('');
  row43[0] = 'CALL RATE:';
  const target = dcrDay?.targetEngagements || dayDoctors.length;
  const total = dcrDay?.totalEngagements || 0;
  row43[11] = target > 0 ? total / target : 0;
  data.push(row43);

  // Row 44: Extra Call header
  const row44 = Array(20).fill('');
  row44[0] = 'EXTRA CALL (VIP NOT INCLUDED IN THE LIST)';
  row44[6] = 'TYPE OF ENGAGEMENT';
  data.push(row44);

  // Row 45: Extra call sub-headers
  const row45 = Array(20).fill('');
  row45[0] = 'NO.';
  row45[6] = 'TXT/ PROMATS';
  row45[7] = 'MES/ VIBER GIF';
  row45[8] = 'PICTURE';
  row45[9] = 'SIGNED CALL';
  row45[10] = 'VOICE CALL';
  data.push(row45);

  // Rows 46-50: Extra call slots
  const extraClients = extraCallsDay?.clients || [];
  for (let i = 0; i < 5; i++) {
    const row = Array(20).fill('');
    if (i < extraClients.length) {
      row[0] = i + 1;
      row[2] = extraClients[i].lastName || '';
      row[3] = extraClients[i].firstName || '';
      const et = extraClients[i].engagementTypes || [];
      row[6] = et.includes('TXT_PROMATS') ? 1 : '';
      row[7] = et.includes('MES_VIBER_GIF') ? 1 : '';
      row[8] = et.includes('PICTURE') ? 1 : '';
      row[9] = et.includes('SIGNED_CALL') ? 1 : '';
      row[10] = et.includes('VOICE_CALL') ? 1 : '';
    }
    data.push(row);
  }

  // Rows 51-56: Notes section
  data.push(Array(20).fill(''));
  data.push(Array(20).fill(''));
  const row53 = Array(20).fill('');
  row53[0] = 'Note:';
  data.push(row53);
  const row54 = Array(20).fill('');
  row54[0] = '1. Type OK in the Date Covered portion if you covered the VIP Customer on target date';
  data.push(row54);
  const row55 = Array(20).fill('');
  row55[0] = '2. Input the correct date if you were not able to cover the VIP Customer on the target date';
  data.push(row55);
  data.push(Array(20).fill(''));

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Column widths
  ws['!cols'] = [
    { wch: 35 }, // A - Count/labels
    { wch: 3 },  // B - spacer
    { wch: 14 }, // C - Lastname
    { wch: 14 }, // D - Firstname
    { wch: 10 }, // E - Specialty
    { wch: 6 },  // F - Freq
    { wch: 12 }, // G - TXT
    { wch: 14 }, // H - MES
    { wch: 8 },  // I - PICTURE
    { wch: 12 }, // J - SIGNED
    { wch: 10 }, // K - VOICE
    { wch: 7 },  // L - TOTAL
    { wch: 3 },  // M - spacer
    { wch: 3 },  // N - spacer
    { wch: 3 },  // O - spacer
    { wch: 14 }, // P - Signature
    { wch: 3 },  // Q - spacer
    { wch: 3 },  // R - spacer
    { wch: 3 },  // S - spacer
    { wch: 12 }, // T - Date covered
  ];

  return ws;
};

/**
 * Merge full doctor profiles with grid data.
 * Grid data provides dayFlags and engagement info.
 * Doctor profiles provide address, products, etc.
 */
const buildMergedDoctorList = (doctors, gridDoctors) => {
  // Build lookup from grid doctors (keyed by _id)
  const gridMap = new Map();
  if (gridDoctors) {
    gridDoctors.forEach((gd) => {
      const id = gd._id?.toString?.() || gd._id;
      gridMap.set(id, gd);
    });
  }

  return doctors.map((doc) => {
    const id = doc._id?.toString?.() || doc._id;
    const gridDoc = gridMap.get(id);

    // Build dayFlags from grid (each cell that has a non-null status = scheduled)
    let dayFlags = Array(20).fill(false);
    let grid = null;

    if (gridDoc) {
      grid = gridDoc.grid;
      dayFlags = gridDoc.grid.map((cell) => cell.status !== null);
    }

    // Get target product names
    const tpNames = [];
    if (doc.targetProducts) {
      doc.targetProducts.forEach((tp) => {
        if (tp.product?.name) {
          tpNames.push(tp.product.name);
        } else if (typeof tp === 'string') {
          tpNames.push(tp);
        }
      });
    }

    // Format birthday/anniversary
    const formatDate = (d) => {
      if (!d) return '';
      const date = new Date(d);
      if (isNaN(date.getTime())) return '';
      return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${String(date.getFullYear()).slice(-2)}`;
    };

    return {
      _id: id,
      lastName: doc.lastName || '',
      firstName: doc.firstName || '',
      specialization: doc.specialization || '',
      visitFrequency: doc.visitFrequency || 4,
      dayFlags,
      grid,
      clinicOfficeAddress: doc.clinicOfficeAddress || '',
      outletIndicator: doc.outletIndicator || '',
      programs: (doc.programsToImplement || []).join(', '),
      support: (doc.supportDuringCoverage || []).join(', '),
      targetProduct1: tpNames[0] || '',
      targetProduct2: tpNames[1] || '',
      targetProduct3: tpNames[2] || '',
      engagementLevel: doc.levelOfEngagement || null,
      secretaryName: doc.secretaryName || '',
      secretaryPhone: doc.secretaryPhone || '',
      birthday: formatDate(doc.birthday),
      anniversary: formatDate(doc.anniversary),
      otherDetails: doc.otherDetails || '',
    };
  });
};

/**
 * Export a full 23-sheet CPT workbook.
 *
 * @param {Object} params
 * @param {Array} params.doctors - Full doctor profile objects
 * @param {Object} params.cptGridData - Response from scheduleService.getCPTGrid()
 *   Contains: { doctors (grid rows), dcrSummary, dailyMDCount, extraCalls }
 * @param {Object} params.config - { bdmName, territory, monthYear, cycleNumber }
 */
export const exportCPTWorkbook = ({ doctors, cptGridData, config }) => {
  const { bdmName = 'BDM', territory = '', monthYear = '', cycleNumber = 0 } = config;

  const gridDoctors = cptGridData?.data?.doctors || cptGridData?.doctors || [];
  const dcrSummary = cptGridData?.data?.dcrSummary || cptGridData?.dcrSummary || [];
  const extraCalls = cptGridData?.data?.extraCalls || cptGridData?.extraCalls || [];

  // Merge doctors with grid data
  const mergedDoctors = buildMergedDoctorList(doctors, gridDoctors);
  mergedDoctors.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));

  const wb = XLSX.utils.book_new();

  // Sheet 1: WEEKLY SUMMARY
  const wsSummary = buildWeeklySummary(dcrSummary);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'WEEKLY SUMMARY');

  // Sheet 2: README
  const wsReadme = buildReadme();
  XLSX.utils.book_append_sheet(wb, wsReadme, 'README');

  // Sheet 3: CALL PLAN - VIP CPT
  const wsCPT = buildCPTMaster(doctors, gridDoctors, { bdmName, territory, monthYear });
  XLSX.utils.book_append_sheet(wb, wsCPT, 'CALL PLAN - VIP CPT');

  // Sheets 4-23: W1D1 through W4D5
  for (let i = 0; i < 20; i++) {
    const week = Math.floor(i / 5) + 1;
    const day = (i % 5) + 1;
    const sheetName = `W${week} D${day}`;

    const dcrDay = dcrSummary[i] || {};
    const extraCallsDay = extraCalls[i] || {};

    const wsDaySheet = buildDaySheet(i, mergedDoctors, dcrDay, extraCallsDay);
    XLSX.utils.book_append_sheet(wb, wsDaySheet, sheetName);
  }

  // Generate and download
  const fileName = `CPT_${bdmName.replace(/\s+/g, '_')}_Cycle${cycleNumber + 1}_${monthYear.replace(/[\s/]+/g, '_')}.xlsx`;
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  saveAs(blob, fileName);
};

export default exportCPTWorkbook;
