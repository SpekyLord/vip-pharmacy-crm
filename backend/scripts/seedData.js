/**
 * Seed Data Script
 *
 * Populates the database with realistic test data:
 * - Admin user + 3 BDM employees
 * - Region hierarchy (Philippines → Region VI → Iloilo → Iloilo City → Districts)
 * - 60 unique VIP Clients (20 per BDM territory)
 * - Proper 4-week schedule where each VIP Client visits on the SAME day every week
 *
 * The schedule mimics a real Call Planning Tool (CPT):
 *   - Each doctor is assigned to ONE consistent day (Mon-Fri)
 *   - 4x doctors: visit every week on that day
 *   - 2x doctors: visit alternating weeks (W1+W3 or W2+W4) on that day
 *   - ~3 visits per day per BDM
 *
 * Usage: npm run seed
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Region = require('../models/Region');
const Doctor = require('../models/Doctor');
const Visit = require('../models/Visit');
const Schedule = require('../models/Schedule');
const Client = require('../models/Client');
const ClientVisit = require('../models/ClientVisit');
const { getCycleNumber, getCycleStartDate } = require('../utils/scheduleCycleUtils');

// ─── Region hierarchy ────────────────────────────────────────────────────────

const regions = [
  { name: 'Philippines', code: 'PH', level: 'country', parent: null },
  // Philippine Regions
  { name: 'Region I', code: 'REG-I', level: 'region', parentCode: 'PH' },
  { name: 'Region II', code: 'REG-II', level: 'region', parentCode: 'PH' },
  { name: 'Region III', code: 'REG-III', level: 'region', parentCode: 'PH' },
  { name: 'Region IV-A', code: 'REG-IV-A', level: 'region', parentCode: 'PH' },
  { name: 'MIMAROPA', code: 'MIMAROPA', level: 'region', parentCode: 'PH' },
  { name: 'Region V', code: 'REG-V', level: 'region', parentCode: 'PH' },
  { name: 'Region VI', code: 'REG-VI', level: 'region', parentCode: 'PH' },
  { name: 'Region VII', code: 'REG-VII', level: 'region', parentCode: 'PH' },
  { name: 'Region VIII', code: 'REG-VIII', level: 'region', parentCode: 'PH' },
  { name: 'Region IX', code: 'REG-IX', level: 'region', parentCode: 'PH' },
  { name: 'Region X', code: 'REG-X', level: 'region', parentCode: 'PH' },
  { name: 'Region XI', code: 'REG-XI', level: 'region', parentCode: 'PH' },
  { name: 'Region XII', code: 'REG-XII', level: 'region', parentCode: 'PH' },
  { name: 'Region XIII', code: 'REG-XIII', level: 'region', parentCode: 'PH' },
  { name: 'NCR', code: 'NCR', level: 'region', parentCode: 'PH' },
  { name: 'CAR', code: 'CAR', level: 'region', parentCode: 'PH' },
  { name: 'BARMM', code: 'BARMM', level: 'region', parentCode: 'PH' },
  { name: 'NIR', code: 'NIR', level: 'region', parentCode: 'PH' },
  // Provinces under Region VI
  { name: 'Iloilo', code: 'ILO', level: 'province', parentCode: 'REG-VI' },
  { name: 'Capiz', code: 'CAP', level: 'province', parentCode: 'REG-VI' },
  { name: 'Aklan', code: 'AKL', level: 'province', parentCode: 'REG-VI' },
  { name: 'Antique', code: 'ANT', level: 'province', parentCode: 'REG-VI' },
  // Cities
  { name: 'Iloilo City', code: 'ILO-CITY', level: 'city', parentCode: 'ILO' },
  { name: 'Roxas City', code: 'ROX-CITY', level: 'city', parentCode: 'CAP' },
  { name: 'Kalibo', code: 'KAL', level: 'city', parentCode: 'AKL' },
  { name: 'San Jose de Buenavista', code: 'SJB', level: 'city', parentCode: 'ANT' },
  // Districts
  { name: 'Jaro District', code: 'ILO-JARO', level: 'district', parentCode: 'ILO-CITY' },
  { name: 'Mandurriao District', code: 'ILO-MAND', level: 'district', parentCode: 'ILO-CITY' },
  { name: 'La Paz District', code: 'ILO-LPAZ', level: 'district', parentCode: 'ILO-CITY' },
];

// ─── Employee definitions ────────────────────────────────────────────────────

const employeeData = [
  { name: 'Juan Dela Cruz', email: 'juan@vipcrm.com', regionCode: 'ILO-JARO' },
  { name: 'Maria Santos', email: 'maria@vipcrm.com', regionCode: 'ILO-MAND' },
  { name: 'Pedro Reyes', email: 'pedro@vipcrm.com', regionCode: 'ILO-LPAZ' },
];

// ─── Doctor definitions (20 per territory, all unique names) ─────────────────
// Each doctor has a fixed day (1-5 = Mon-Fri) and visit pattern.
// 4x doctors: visit every week on their day
// 2x doctors: visit W1+W3 or W2+W4 on their day
//
// Result: each day has exactly 3 visits per week:
//   2 × 4x doctors (every week) + 1 × 2x doctor (alternating weeks)
//
// Clinic schedule: mon-fri default true. We set the assigned day to true
// and randomly mark 1-2 other days as unavailable for realism.

const jaroDoctors = [
  // ── Monday (day 1) ──
  { firstName: 'Elena', lastName: 'Santos', spec: 'Pediatrics', freq: 4, day: 1, hosp: 'Iloilo Doctors Hospital', eng: 4, programs: ['CME GRANT'], support: ['STARTER DOSES', 'PROMATS'], secName: 'Lisa Ramos', secPhone: '+63 9171234001', birthday: '1975-03-15', notes: 'Prefers morning visits. Very open to new products.' },
  { firstName: 'Miguel', lastName: 'Torres', spec: 'Cardiology', freq: 4, day: 1, hosp: 'Western Visayas Medical Center', eng: 3, programs: ['REBATES / MONEY'], support: ['FULL DOSE'], birthday: '1968-08-22' },
  { firstName: 'Rosa', lastName: 'Mendoza', spec: 'IM Gastro', freq: 2, pattern: 'W1W3', day: 1, hosp: 'St. Paul\'s Hospital', eng: 2, support: ['PATIENT DISCOUNT'] },
  { firstName: 'Carlos', lastName: 'Lim', spec: 'ENT', freq: 2, pattern: 'W2W4', day: 1, hosp: 'Iloilo Mission Hospital', eng: 5, programs: ['CME GRANT', 'REST AND RECREATION'], support: ['STARTER DOSES', 'AIR FRESHENER'], secName: 'Joy Tan', secPhone: '+63 9181234002', anniversary: '2010-06-12' },
  // ── Tuesday (day 2) ──
  { firstName: 'Ana', lastName: 'Reyes', spec: 'Dermatology', freq: 4, day: 2, hosp: 'Medicus Medical Center', eng: 5, programs: ['REST AND RECREATION', 'MED SOCIETY PARTICIPATION'], support: ['PROMATS', 'FULL DOSE'], birthday: '1980-11-03', notes: 'Active partner. Participates in all CME events.' },
  { firstName: 'Jose', lastName: 'Garcia', spec: 'General Surgery', freq: 4, day: 2, hosp: 'Metro Iloilo Hospital', eng: 3, support: ['STARTER DOSES'] },
  { firstName: 'Sofia', lastName: 'Navarro', spec: 'Internal Medicine', freq: 2, pattern: 'W1W3', day: 2, hosp: 'Iloilo Doctors Hospital', eng: 2, programs: ['REBATES / MONEY'] },
  { firstName: 'Antonio', lastName: 'Bautista', spec: 'Pulmonology', freq: 2, pattern: 'W2W4', day: 2, hosp: 'Western Visayas Medical Center', eng: 1, support: ['PATIENT DISCOUNT', 'AIR FRESHENER'] },
  // ── Wednesday (day 3) ──
  { firstName: 'Carmen', lastName: 'Villanueva', spec: 'General Practice', freq: 4, day: 3, hosp: 'St. Paul\'s Hospital', eng: 4, programs: ['CME GRANT'], support: ['PROMATS'], secName: 'Beth Cruz', secPhone: '+63 9191234003' },
  { firstName: 'Rafael', lastName: 'Aquino', spec: 'Cardiology', freq: 4, day: 3, hosp: 'Iloilo Mission Hospital', eng: 3, programs: ['MED SOCIETY PARTICIPATION'], support: ['FULL DOSE', 'STARTER DOSES'], birthday: '1972-05-28' },
  { firstName: 'Lucia', lastName: 'Fernandez', spec: 'Pediatrics', freq: 2, pattern: 'W1W3', day: 3, hosp: 'Medicus Medical Center', eng: 2 },
  { firstName: 'Manuel', lastName: 'Ramos', spec: 'Dermatology', freq: 2, pattern: 'W2W4', day: 3, hosp: 'Metro Iloilo Hospital', eng: 4, programs: ['REST AND RECREATION'], support: ['PROMATS'] },
  // ── Thursday (day 4) ──
  { firstName: 'Isabel', lastName: 'Morales', spec: 'ENT', freq: 4, day: 4, hosp: 'Iloilo Doctors Hospital', eng: 3, support: ['STARTER DOSES', 'PATIENT DISCOUNT'], birthday: '1983-01-10' },
  { firstName: 'Ricardo', lastName: 'Cruz', spec: 'IM Gastro', freq: 4, day: 4, hosp: 'Western Visayas Medical Center', eng: 5, programs: ['CME GRANT', 'REBATES / MONEY'], support: ['FULL DOSE'], secName: 'Nina Santos', secPhone: '+63 9201234004', notes: 'Top prescriber. Always ask about clinical trial updates.', otherDetails: 'Preferred contact: secretary first. Clinic closes at 4 PM.' },
  { firstName: 'Teresa', lastName: 'Lopez', spec: 'Pulmonology', freq: 2, pattern: 'W1W3', day: 4, hosp: 'St. Paul\'s Hospital', eng: 1 },
  { firstName: 'Fernando', lastName: 'Castillo', spec: 'General Surgery', freq: 2, pattern: 'W2W4', day: 4, hosp: 'Iloilo Mission Hospital', eng: 2, support: ['AIR FRESHENER'] },
  // ── Friday (day 5) ──
  { firstName: 'Patricia', lastName: 'Dela Rosa', spec: 'Internal Medicine', freq: 4, day: 5, hosp: 'Medicus Medical Center', eng: 4, programs: ['MED SOCIETY PARTICIPATION', 'CME GRANT'], support: ['PROMATS', 'FULL DOSE'], anniversary: '2015-02-14' },
  { firstName: 'Andres', lastName: 'Soriano', spec: 'General Practice', freq: 4, day: 5, hosp: 'Metro Iloilo Hospital', eng: 3, support: ['STARTER DOSES'] },
  { firstName: 'Catalina', lastName: 'Perez', spec: 'Cardiology', freq: 2, pattern: 'W1W3', day: 5, hosp: 'Iloilo Doctors Hospital', eng: 2, programs: ['REBATES / MONEY'] },
  { firstName: 'Roberto', lastName: 'Flores', spec: 'Dermatology', freq: 2, pattern: 'W2W4', day: 5, hosp: 'Western Visayas Medical Center', eng: 1 },
];

const mandurriaoDoctors = [
  // ── Monday (day 1) ──
  { firstName: 'Gloria', lastName: 'Tan', spec: 'Pediatrics', freq: 4, day: 1, hosp: 'Iloilo Doctors Hospital', eng: 5, programs: ['CME GRANT', 'MED SOCIETY PARTICIPATION'], support: ['STARTER DOSES', 'PROMATS'], secName: 'Amy Lim', secPhone: '+63 9171235001', birthday: '1970-07-20', notes: 'Very cooperative. Always available on schedule.' },
  { firstName: 'Eduardo', lastName: 'Rivera', spec: 'Cardiology', freq: 4, day: 1, hosp: 'Western Visayas Medical Center', eng: 3, support: ['FULL DOSE'] },
  { firstName: 'Beatriz', lastName: 'Santiago', spec: 'IM Gastro', freq: 2, pattern: 'W1W3', day: 1, hosp: 'St. Paul\'s Hospital', eng: 2, programs: ['REBATES / MONEY'], support: ['PATIENT DISCOUNT'] },
  { firstName: 'Francisco', lastName: 'Ocampo', spec: 'ENT', freq: 2, pattern: 'W2W4', day: 1, hosp: 'Iloilo Mission Hospital', eng: 4, support: ['AIR FRESHENER'] },
  // ── Tuesday (day 2) ──
  { firstName: 'Rosario', lastName: 'Diaz', spec: 'Dermatology', freq: 4, day: 2, hosp: 'Medicus Medical Center', eng: 4, programs: ['REST AND RECREATION'], support: ['PROMATS', 'FULL DOSE'], birthday: '1978-04-11' },
  { firstName: 'Alberto', lastName: 'Manalo', spec: 'General Surgery', freq: 4, day: 2, hosp: 'Metro Iloilo Hospital', eng: 3, support: ['STARTER DOSES'] },
  { firstName: 'Consuelo', lastName: 'Velasco', spec: 'Internal Medicine', freq: 2, pattern: 'W1W3', day: 2, hosp: 'Iloilo Doctors Hospital', eng: 2 },
  { firstName: 'Ramon', lastName: 'Aguilar', spec: 'Pulmonology', freq: 2, pattern: 'W2W4', day: 2, hosp: 'Western Visayas Medical Center', eng: 1, support: ['PATIENT DISCOUNT'] },
  // ── Wednesday (day 3) ──
  { firstName: 'Pilar', lastName: 'Mercado', spec: 'General Practice', freq: 4, day: 3, hosp: 'St. Paul\'s Hospital', eng: 4, programs: ['CME GRANT'], support: ['PROMATS'], secName: 'Grace Uy', secPhone: '+63 9191235003' },
  { firstName: 'Ernesto', lastName: 'Pascual', spec: 'Cardiology', freq: 4, day: 3, hosp: 'Iloilo Mission Hospital', eng: 3, programs: ['MED SOCIETY PARTICIPATION'], support: ['FULL DOSE'] },
  { firstName: 'Dolores', lastName: 'Yap', spec: 'Pediatrics', freq: 2, pattern: 'W1W3', day: 3, hosp: 'Medicus Medical Center', eng: 2, support: ['STARTER DOSES'] },
  { firstName: 'Arturo', lastName: 'Trinidad', spec: 'Dermatology', freq: 2, pattern: 'W2W4', day: 3, hosp: 'Metro Iloilo Hospital', eng: 4, programs: ['REST AND RECREATION'] },
  // ── Thursday (day 4) ──
  { firstName: 'Virginia', lastName: 'Salazar', spec: 'ENT', freq: 4, day: 4, hosp: 'Iloilo Doctors Hospital', eng: 3, support: ['STARTER DOSES', 'PATIENT DISCOUNT'] },
  { firstName: 'Gregorio', lastName: 'Fuentes', spec: 'IM Gastro', freq: 4, day: 4, hosp: 'Western Visayas Medical Center', eng: 5, programs: ['CME GRANT', 'REBATES / MONEY'], support: ['FULL DOSE'], secName: 'Mila Reyes', secPhone: '+63 9201235004', birthday: '1965-12-25', notes: 'Senior doctor. Highly influential in the community.' },
  { firstName: 'Leonora', lastName: 'Chua', spec: 'Pulmonology', freq: 2, pattern: 'W1W3', day: 4, hosp: 'St. Paul\'s Hospital', eng: 1 },
  { firstName: 'Mariano', lastName: 'Bello', spec: 'General Surgery', freq: 2, pattern: 'W2W4', day: 4, hosp: 'Iloilo Mission Hospital', eng: 2, support: ['AIR FRESHENER'] },
  // ── Friday (day 5) ──
  { firstName: 'Remedios', lastName: 'Ong', spec: 'Internal Medicine', freq: 4, day: 5, hosp: 'Medicus Medical Center', eng: 4, programs: ['MED SOCIETY PARTICIPATION'], support: ['PROMATS', 'FULL DOSE'] },
  { firstName: 'Danilo', lastName: 'Villar', spec: 'General Practice', freq: 4, day: 5, hosp: 'Metro Iloilo Hospital', eng: 3, support: ['STARTER DOSES'], birthday: '1976-09-05' },
  { firstName: 'Angelina', lastName: 'Sy', spec: 'Cardiology', freq: 2, pattern: 'W1W3', day: 5, hosp: 'Iloilo Doctors Hospital', eng: 2, programs: ['REBATES / MONEY'] },
  { firstName: 'Renato', lastName: 'Mapa', spec: 'Dermatology', freq: 2, pattern: 'W2W4', day: 5, hosp: 'Western Visayas Medical Center', eng: 1 },
];

const lapazDoctors = [
  // ── Monday (day 1) ──
  { firstName: 'Corazon', lastName: 'Pascual', spec: 'Pediatrics', freq: 4, day: 1, hosp: 'Iloilo Doctors Hospital', eng: 5, programs: ['CME GRANT', 'REST AND RECREATION'], support: ['STARTER DOSES', 'PROMATS'], birthday: '1969-02-14', notes: 'Long-time partner. Always receptive to new programs.' },
  { firstName: 'Nestor', lastName: 'Galang', spec: 'Cardiology', freq: 4, day: 1, hosp: 'Western Visayas Medical Center', eng: 3, support: ['FULL DOSE'] },
  { firstName: 'Felisa', lastName: 'De Leon', spec: 'IM Gastro', freq: 2, pattern: 'W1W3', day: 1, hosp: 'St. Paul\'s Hospital', eng: 2, support: ['PATIENT DISCOUNT'] },
  { firstName: 'Leandro', lastName: 'Escano', spec: 'ENT', freq: 2, pattern: 'W2W4', day: 1, hosp: 'Iloilo Mission Hospital', eng: 4, programs: ['MED SOCIETY PARTICIPATION'], support: ['AIR FRESHENER'], secName: 'Lorna Reyes', secPhone: '+63 9171236001' },
  // ── Tuesday (day 2) ──
  { firstName: 'Milagros', lastName: 'Ponce', spec: 'Dermatology', freq: 4, day: 2, hosp: 'Medicus Medical Center', eng: 4, programs: ['REST AND RECREATION'], support: ['PROMATS', 'FULL DOSE'] },
  { firstName: 'Oscar', lastName: 'Sison', spec: 'General Surgery', freq: 4, day: 2, hosp: 'Metro Iloilo Hospital', eng: 3, support: ['STARTER DOSES'], birthday: '1981-06-30' },
  { firstName: 'Esperanza', lastName: 'Abad', spec: 'Internal Medicine', freq: 2, pattern: 'W1W3', day: 2, hosp: 'Iloilo Doctors Hospital', eng: 2, programs: ['REBATES / MONEY'] },
  { firstName: 'Virgilio', lastName: 'Jimenez', spec: 'Pulmonology', freq: 2, pattern: 'W2W4', day: 2, hosp: 'Western Visayas Medical Center', eng: 1, support: ['PATIENT DISCOUNT'] },
  // ── Wednesday (day 3) ──
  { firstName: 'Natividad', lastName: 'Luna', spec: 'General Practice', freq: 4, day: 3, hosp: 'St. Paul\'s Hospital', eng: 4, programs: ['CME GRANT'], support: ['PROMATS'], secName: 'Cora Abad', secPhone: '+63 9191236003' },
  { firstName: 'Hernando', lastName: 'Solis', spec: 'Cardiology', freq: 4, day: 3, hosp: 'Iloilo Mission Hospital', eng: 3, programs: ['MED SOCIETY PARTICIPATION'], support: ['FULL DOSE'] },
  { firstName: 'Amelia', lastName: 'Castro', spec: 'Pediatrics', freq: 2, pattern: 'W1W3', day: 3, hosp: 'Medicus Medical Center', eng: 2, support: ['STARTER DOSES'] },
  { firstName: 'Teodoro', lastName: 'Lara', spec: 'Dermatology', freq: 2, pattern: 'W2W4', day: 3, hosp: 'Metro Iloilo Hospital', eng: 4, programs: ['REST AND RECREATION'] },
  // ── Thursday (day 4) ──
  { firstName: 'Josefina', lastName: 'Abaya', spec: 'ENT', freq: 4, day: 4, hosp: 'Iloilo Doctors Hospital', eng: 3, support: ['STARTER DOSES', 'PATIENT DISCOUNT'], birthday: '1977-10-18' },
  { firstName: 'Domingo', lastName: 'Enriquez', spec: 'IM Gastro', freq: 4, day: 4, hosp: 'Western Visayas Medical Center', eng: 5, programs: ['CME GRANT', 'REBATES / MONEY'], support: ['FULL DOSE'], secName: 'Tessie Go', secPhone: '+63 9201236004', notes: 'Key opinion leader. Valuable for product launches.' },
  { firstName: 'Concepcion', lastName: 'Alba', spec: 'Pulmonology', freq: 2, pattern: 'W1W3', day: 4, hosp: 'St. Paul\'s Hospital', eng: 1 },
  { firstName: 'Alfredo', lastName: 'Tugade', spec: 'General Surgery', freq: 2, pattern: 'W2W4', day: 4, hosp: 'Iloilo Mission Hospital', eng: 2, support: ['AIR FRESHENER'] },
  // ── Friday (day 5) ──
  { firstName: 'Imelda', lastName: 'Viray', spec: 'Internal Medicine', freq: 4, day: 5, hosp: 'Medicus Medical Center', eng: 4, programs: ['MED SOCIETY PARTICIPATION', 'CME GRANT'], support: ['PROMATS', 'FULL DOSE'] },
  { firstName: 'Gerardo', lastName: 'Sotto', spec: 'General Practice', freq: 4, day: 5, hosp: 'Metro Iloilo Hospital', eng: 3, support: ['STARTER DOSES'], anniversary: '2018-11-20' },
  { firstName: 'Luzviminda', lastName: 'Dy', spec: 'Cardiology', freq: 2, pattern: 'W1W3', day: 5, hosp: 'Iloilo Doctors Hospital', eng: 2, programs: ['REBATES / MONEY'] },
  { firstName: 'Rogelio', lastName: 'Balbin', spec: 'Dermatology', freq: 2, pattern: 'W2W4', day: 5, hosp: 'Western Visayas Medical Center', eng: 1 },
];

// Map territory code → doctor list
const territoryDoctors = {
  'ILO-JARO': jaroDoctors,
  'ILO-MAND': mandurriaoDoctors,
  'ILO-LPAZ': lapazDoctors,
};

// ─── Schedule status assignment ──────────────────────────────────────────────
// Today = Feb 27, 2026 = Cycle 1, W4D5 (Friday, last workday of cycle).
//
// We use explicit lookup sets for non-completed statuses to get a realistic mix:
//   W1: 13 completed, 2 missed (Santos idx 0, Garcia idx 5)
//   W2: 12 completed, 3 carried (Torres idx 1, Bautista idx 7, Castillo idx 15)
//   W3: 11 completed, 4 carried (Reyes idx 4, Aquino idx 9, Cruz idx 13, Perez idx 18)
//   W4: 12 completed (Mon-Thu), 3 planned (Fri = today)
//
// Per BDM totals: 48 completed, 7 carried, 2 missed, 3 planned = 60

// 'docIndex-week' keys for non-completed entries (same pattern applies to each BDM)
const MISSED_KEYS = new Set(['0-1', '5-1']);
const CARRIED_KEYS = new Set(['1-2', '7-2', '15-2', '4-3', '9-3', '13-3', '18-3']);

function getDateInWeek(cycleStart, week, day) {
  const d = new Date(cycleStart);
  d.setDate(d.getDate() + (week - 1) * 7 + (day - 1));
  d.setHours(9 + Math.floor(Math.random() * 6), Math.floor(Math.random() * 60), 0, 0);
  return d;
}

function assignEntryStatus(docIndex, scheduledWeek, scheduledDay, cycleStart) {
  const key = `${docIndex}-${scheduledWeek}`;

  if (MISSED_KEYS.has(key)) {
    return { status: 'missed', completedAt: null, completedInWeek: null, carriedToWeek: null };
  }

  if (CARRIED_KEYS.has(key)) {
    return { status: 'carried', completedAt: null, completedInWeek: null, carriedToWeek: 4 };
  }

  // W4 Friday entries = planned (today)
  if (scheduledWeek === 4 && scheduledDay === 5) {
    return { status: 'planned', completedAt: null, completedInWeek: null, carriedToWeek: null };
  }

  // Everything else = completed
  return {
    status: 'completed',
    completedAt: getDateInWeek(cycleStart, scheduledWeek, scheduledDay),
    completedInWeek: scheduledWeek,
    carriedToWeek: null,
  };
}

// ─── Main seed function ──────────────────────────────────────────────────────

const seedDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected for seeding...');

    // Clear existing data
    console.log('Clearing existing data...');
    await Promise.all([
      User.deleteMany({}),
      Region.deleteMany({}),
      Doctor.deleteMany({}),
      Schedule.deleteMany({}),
      Visit.deleteMany({}),
      Client.deleteMany({}),
      ClientVisit.deleteMany({}),
    ]);

    // 1. Create Regions
    console.log('Creating regions...');
    const regionMap = {};

    // First pass: root regions (no parent)
    for (const r of regions) {
      if (!r.parentCode) {
        const created = await Region.create({ name: r.name, code: r.code, level: r.level, parent: null });
        regionMap[r.code] = created._id;
      }
    }
    // Second pass: child regions
    for (const r of regions) {
      if (r.parentCode) {
        const created = await Region.create({ name: r.name, code: r.code, level: r.level, parent: regionMap[r.parentCode] });
        regionMap[r.code] = created._id;
      }
    }
    console.log(`  Created ${Object.keys(regionMap).length} regions`);

    // 2. Create Admin
    console.log('Creating admin user...');
    await User.create({
      name: 'System Administrator',
      email: 'admin@vipcrm.com',
      password: 'Admin123!@#',
      role: 'admin',
      canAccessAllRegions: true,
      isActive: true,
    });
    console.log('  Admin created: admin@vipcrm.com');

    // 3. Create BDM Employees
    console.log('Creating BDM employees...');
    const employees = [];
    for (const emp of employeeData) {
      const user = await User.create({
        name: emp.name,
        email: emp.email,
        password: 'BDM123!@#',
        role: 'employee',
        assignedRegions: [regionMap[emp.regionCode]],
        isActive: true,
      });
      employees.push({ user, regionCode: emp.regionCode });
      console.log(`  BDM created: ${emp.email} → ${emp.regionCode}`);
    }

    // 4. Create Doctors + Schedule
    console.log('Creating VIP Clients and schedule...');
    const today = new Date(2026, 1, 27); // Feb 27, 2026
    const currentCycleNumber = getCycleNumber(today);
    const cycleStart = getCycleStartDate(currentCycleNumber);
    let totalDoctors = 0;
    let totalScheduleEntries = 0;

    const statusCounts = { completed: 0, carried: 0, missed: 0, planned: 0 };

    for (const { user: employee, regionCode } of employees) {
      const doctorDefs = territoryDoctors[regionCode];
      if (!doctorDefs) continue;

      const regionId = regionMap[regionCode];

      for (let docIdx = 0; docIdx < doctorDefs.length; docIdx++) {
        const def = doctorDefs[docIdx];

        // Create the Doctor document
        const doctorData = {
          firstName: def.firstName,
          lastName: def.lastName,
          specialization: def.spec,
          clinicOfficeAddress: def.hosp,
          region: regionId,
          assignedTo: employee._id,
          visitFrequency: def.freq,
          levelOfEngagement: def.eng || null,
          programsToImplement: def.programs || [],
          supportDuringCoverage: def.support || [],
          phone: `+63 9${String(170000000 + totalDoctors * 1111).slice(0, 9)}`,
          isActive: true,
        };

        if (def.secName) doctorData.secretaryName = def.secName;
        if (def.secPhone) doctorData.secretaryPhone = def.secPhone;
        if (def.birthday) doctorData.birthday = new Date(def.birthday);
        if (def.anniversary) doctorData.anniversary = new Date(def.anniversary);
        if (def.notes) doctorData.notes = def.notes;
        if (def.otherDetails) doctorData.otherDetails = def.otherDetails;

        const doctor = await Doctor.create(doctorData);
        totalDoctors++;

        // Create Schedule entries
        // 4x → weeks [1,2,3,4], 2x → W1W3 or W2W4
        const weeks = def.freq === 4
          ? [1, 2, 3, 4]
          : def.pattern === 'W1W3' ? [1, 3] : [2, 4];

        for (const week of weeks) {
          const entry = assignEntryStatus(docIdx, week, def.day, cycleStart);

          await Schedule.create({
            doctor: doctor._id,
            user: employee._id,
            cycleStart,
            cycleNumber: currentCycleNumber,
            scheduledWeek: week,
            scheduledDay: def.day,
            scheduledLabel: `W${week}D${def.day}`,
            status: entry.status,
            completedAt: entry.completedAt,
            completedInWeek: entry.completedInWeek,
            carriedToWeek: entry.carriedToWeek,
          });

          statusCounts[entry.status]++;
          totalScheduleEntries++;
        }
      }
      console.log(`  ${employee.name}: ${doctorDefs.length} VIP Clients, schedules created`);
    }

    console.log(`\nCreated ${totalDoctors} VIP Clients`);
    console.log(`Created ${totalScheduleEntries} schedule entries (cycle ${currentCycleNumber})`);
    console.log(`  Completed: ${statusCounts.completed}`);
    console.log(`  Carried:   ${statusCounts.carried}`);
    console.log(`  Missed:    ${statusCounts.missed}`);
    console.log(`  Planned:   ${statusCounts.planned}`);

    // Summary
    console.log('\n========================================');
    console.log('SEED DATA COMPLETE!');
    console.log('========================================');
    console.log('\nLogin Credentials:');
    console.log('------------------');
    console.log('Admin:    admin@vipcrm.com / Admin123!@#');
    console.log('BDM:      juan@vipcrm.com / BDM123!@#');
    console.log('BDM:      maria@vipcrm.com / BDM123!@#');
    console.log('BDM:      pedro@vipcrm.com / BDM123!@#');
    console.log('\nSchedule Design:');
    console.log('----------------');
    console.log('Each BDM has 20 VIP Clients:');
    console.log('  10 × 4x frequency (every week, same day)');
    console.log('  10 × 2x frequency (alternating weeks, same day)');
    console.log('  = 3 visits/day, 15 visits/week, 60 entries/cycle');
    console.log('\nCycle Info:');
    console.log(`  Cycle ${currentCycleNumber}: starts ${cycleStart.toDateString()}`);
    console.log('  Today = W4D5 (Friday, last workday of cycle)');
    console.log('========================================\n');

    await mongoose.connection.close();
    console.log('Database connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

seedDatabase();
