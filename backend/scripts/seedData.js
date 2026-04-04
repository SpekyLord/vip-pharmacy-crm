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
const Doctor = require('../models/Doctor');
const Visit = require('../models/Visit');
const Schedule = require('../models/Schedule');
const Client = require('../models/Client');
const ClientVisit = require('../models/ClientVisit');
const ProductAssignment = require('../models/ProductAssignment');
const CrmProduct = require('../models/CrmProduct');
const { getCycleNumber, getCycleStartDate } = require('../utils/scheduleCycleUtils');

// ─── Employee definitions ────────────────────────────────────────────────────

const employeeData = [
  { name: 'Juan Dela Cruz', email: 'juan@vipcrm.com', territory: 'Jaro' },
  { name: 'Maria Santos', email: 'maria@vipcrm.com', territory: 'Mandurriao' },
  { name: 'Pedro Reyes', email: 'pedro@vipcrm.com', territory: 'La Paz' },
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
  { firstName: 'Elena', lastName: 'Santos', spec: 'Pedia', freq: 4, day: 1, hosp: 'Iloilo Doctors Hospital', eng: 4, programs: ['CME GRANT'], support: ['STARTER DOSES', 'PROMATS'], secName: 'Lisa Ramos', secPhone: '+63 9171234001', birthday: '1975-03-15', notes: 'Prefers morning visits. Very open to new products.' },
  { firstName: 'Miguel', lastName: 'Torres', spec: 'IM Car', freq: 4, day: 1, hosp: 'Western Visayas Medical Center', eng: 3, programs: ['REBATES / MONEY'], support: ['FULL DOSE'], birthday: '1968-08-22' },
  { firstName: 'Rosa', lastName: 'Mendoza', spec: 'IM Gastro', freq: 2, pattern: 'W1W3', day: 1, hosp: 'St. Paul\'s Hospital', eng: 2, support: ['PATIENT DISCOUNT'] },
  { firstName: 'Carlos', lastName: 'Lim', spec: 'ENT', freq: 2, pattern: 'W2W4', day: 1, hosp: 'Iloilo Mission Hospital', eng: 5, programs: ['CME GRANT', 'REST AND RECREATION'], support: ['STARTER DOSES', 'AIR FRESHENER'], secName: 'Joy Tan', secPhone: '+63 9181234002', anniversary: '2010-06-12' },
  // ── Tuesday (day 2) ──
  { firstName: 'Ana', lastName: 'Reyes', spec: 'Derma', freq: 4, day: 2, hosp: 'Medicus Medical Center', eng: 5, programs: ['REST AND RECREATION', 'MED SOCIETY PARTICIPATION'], support: ['PROMATS', 'FULL DOSE'], birthday: '1980-11-03', notes: 'Active partner. Participates in all CME events.' },
  { firstName: 'Jose', lastName: 'Garcia', spec: 'Surg', freq: 4, day: 2, hosp: 'Metro Iloilo Hospital', eng: 3, support: ['STARTER DOSES'] },
  { firstName: 'Sofia', lastName: 'Navarro', spec: 'IM', freq: 2, pattern: 'W1W3', day: 2, hosp: 'Iloilo Doctors Hospital', eng: 2, programs: ['REBATES / MONEY'] },
  { firstName: 'Antonio', lastName: 'Bautista', spec: 'Pulmo', freq: 2, pattern: 'W2W4', day: 2, hosp: 'Western Visayas Medical Center', eng: 1, support: ['PATIENT DISCOUNT', 'AIR FRESHENER'] },
  // ── Wednesday (day 3) ──
  { firstName: 'Carmen', lastName: 'Villanueva', spec: 'GP', freq: 4, day: 3, hosp: 'St. Paul\'s Hospital', eng: 4, programs: ['CME GRANT'], support: ['PROMATS'], secName: 'Beth Cruz', secPhone: '+63 9191234003' },
  { firstName: 'Rafael', lastName: 'Aquino', spec: 'IM Car', freq: 4, day: 3, hosp: 'Iloilo Mission Hospital', eng: 3, programs: ['MED SOCIETY PARTICIPATION'], support: ['FULL DOSE', 'STARTER DOSES'], birthday: '1972-05-28' },
  { firstName: 'Lucia', lastName: 'Fernandez', spec: 'Pedia', freq: 2, pattern: 'W1W3', day: 3, hosp: 'Medicus Medical Center', eng: 2 },
  { firstName: 'Manuel', lastName: 'Ramos', spec: 'Derma', freq: 2, pattern: 'W2W4', day: 3, hosp: 'Metro Iloilo Hospital', eng: 4, programs: ['REST AND RECREATION'], support: ['PROMATS'] },
  // ── Thursday (day 4) ──
  { firstName: 'Isabel', lastName: 'Morales', spec: 'ENT', freq: 4, day: 4, hosp: 'Iloilo Doctors Hospital', eng: 3, support: ['STARTER DOSES', 'PATIENT DISCOUNT'], birthday: '1983-01-10' },
  { firstName: 'Ricardo', lastName: 'Cruz', spec: 'IM Gastro', freq: 4, day: 4, hosp: 'Western Visayas Medical Center', eng: 5, programs: ['CME GRANT', 'REBATES / MONEY'], support: ['FULL DOSE'], secName: 'Nina Santos', secPhone: '+63 9201234004', notes: 'Top prescriber. Always ask about clinical trial updates.', otherDetails: 'Preferred contact: secretary first. Clinic closes at 4 PM.' },
  { firstName: 'Teresa', lastName: 'Lopez', spec: 'Pulmo', freq: 2, pattern: 'W1W3', day: 4, hosp: 'St. Paul\'s Hospital', eng: 1 },
  { firstName: 'Fernando', lastName: 'Castillo', spec: 'Surg', freq: 2, pattern: 'W2W4', day: 4, hosp: 'Iloilo Mission Hospital', eng: 2, support: ['AIR FRESHENER'] },
  // ── Friday (day 5) ──
  { firstName: 'Patricia', lastName: 'Dela Rosa', spec: 'IM', freq: 4, day: 5, hosp: 'Medicus Medical Center', eng: 4, programs: ['MED SOCIETY PARTICIPATION', 'CME GRANT'], support: ['PROMATS', 'FULL DOSE'], anniversary: '2015-02-14' },
  { firstName: 'Andres', lastName: 'Soriano', spec: 'GP', freq: 4, day: 5, hosp: 'Metro Iloilo Hospital', eng: 3, support: ['STARTER DOSES'] },
  { firstName: 'Catalina', lastName: 'Perez', spec: 'IM Car', freq: 2, pattern: 'W1W3', day: 5, hosp: 'Iloilo Doctors Hospital', eng: 2, programs: ['REBATES / MONEY'] },
  { firstName: 'Roberto', lastName: 'Flores', spec: 'Derma', freq: 2, pattern: 'W2W4', day: 5, hosp: 'Western Visayas Medical Center', eng: 1 },
];

const mandurriaoDoctors = [
  // ── Monday (day 1) ──
  { firstName: 'Gloria', lastName: 'Tan', spec: 'Pedia', freq: 4, day: 1, hosp: 'Iloilo Doctors Hospital', eng: 5, programs: ['CME GRANT', 'MED SOCIETY PARTICIPATION'], support: ['STARTER DOSES', 'PROMATS'], secName: 'Amy Lim', secPhone: '+63 9171235001', birthday: '1970-07-20', notes: 'Very cooperative. Always available on schedule.' },
  { firstName: 'Eduardo', lastName: 'Rivera', spec: 'IM Car', freq: 4, day: 1, hosp: 'Western Visayas Medical Center', eng: 3, support: ['FULL DOSE'] },
  { firstName: 'Beatriz', lastName: 'Santiago', spec: 'IM Gastro', freq: 2, pattern: 'W1W3', day: 1, hosp: 'St. Paul\'s Hospital', eng: 2, programs: ['REBATES / MONEY'], support: ['PATIENT DISCOUNT'] },
  { firstName: 'Francisco', lastName: 'Ocampo', spec: 'ENT', freq: 2, pattern: 'W2W4', day: 1, hosp: 'Iloilo Mission Hospital', eng: 4, support: ['AIR FRESHENER'] },
  // ── Tuesday (day 2) ──
  { firstName: 'Rosario', lastName: 'Diaz', spec: 'Derma', freq: 4, day: 2, hosp: 'Medicus Medical Center', eng: 4, programs: ['REST AND RECREATION'], support: ['PROMATS', 'FULL DOSE'], birthday: '1978-04-11' },
  { firstName: 'Alberto', lastName: 'Manalo', spec: 'Surg', freq: 4, day: 2, hosp: 'Metro Iloilo Hospital', eng: 3, support: ['STARTER DOSES'] },
  { firstName: 'Consuelo', lastName: 'Velasco', spec: 'IM', freq: 2, pattern: 'W1W3', day: 2, hosp: 'Iloilo Doctors Hospital', eng: 2 },
  { firstName: 'Ramon', lastName: 'Aguilar', spec: 'Pulmo', freq: 2, pattern: 'W2W4', day: 2, hosp: 'Western Visayas Medical Center', eng: 1, support: ['PATIENT DISCOUNT'] },
  // ── Wednesday (day 3) ──
  { firstName: 'Pilar', lastName: 'Mercado', spec: 'GP', freq: 4, day: 3, hosp: 'St. Paul\'s Hospital', eng: 4, programs: ['CME GRANT'], support: ['PROMATS'], secName: 'Grace Uy', secPhone: '+63 9191235003' },
  { firstName: 'Ernesto', lastName: 'Pascual', spec: 'IM Car', freq: 4, day: 3, hosp: 'Iloilo Mission Hospital', eng: 3, programs: ['MED SOCIETY PARTICIPATION'], support: ['FULL DOSE'] },
  { firstName: 'Dolores', lastName: 'Yap', spec: 'Pedia', freq: 2, pattern: 'W1W3', day: 3, hosp: 'Medicus Medical Center', eng: 2, support: ['STARTER DOSES'] },
  { firstName: 'Arturo', lastName: 'Trinidad', spec: 'Derma', freq: 2, pattern: 'W2W4', day: 3, hosp: 'Metro Iloilo Hospital', eng: 4, programs: ['REST AND RECREATION'] },
  // ── Thursday (day 4) ──
  { firstName: 'Virginia', lastName: 'Salazar', spec: 'ENT', freq: 4, day: 4, hosp: 'Iloilo Doctors Hospital', eng: 3, support: ['STARTER DOSES', 'PATIENT DISCOUNT'] },
  { firstName: 'Gregorio', lastName: 'Fuentes', spec: 'IM Gastro', freq: 4, day: 4, hosp: 'Western Visayas Medical Center', eng: 5, programs: ['CME GRANT', 'REBATES / MONEY'], support: ['FULL DOSE'], secName: 'Mila Reyes', secPhone: '+63 9201235004', birthday: '1965-12-25', notes: 'Senior doctor. Highly influential in the community.' },
  { firstName: 'Leonora', lastName: 'Chua', spec: 'Pulmo', freq: 2, pattern: 'W1W3', day: 4, hosp: 'St. Paul\'s Hospital', eng: 1 },
  { firstName: 'Mariano', lastName: 'Bello', spec: 'Surg', freq: 2, pattern: 'W2W4', day: 4, hosp: 'Iloilo Mission Hospital', eng: 2, support: ['AIR FRESHENER'] },
  // ── Friday (day 5) ──
  { firstName: 'Remedios', lastName: 'Ong', spec: 'IM', freq: 4, day: 5, hosp: 'Medicus Medical Center', eng: 4, programs: ['MED SOCIETY PARTICIPATION'], support: ['PROMATS', 'FULL DOSE'] },
  { firstName: 'Danilo', lastName: 'Villar', spec: 'GP', freq: 4, day: 5, hosp: 'Metro Iloilo Hospital', eng: 3, support: ['STARTER DOSES'], birthday: '1976-09-05' },
  { firstName: 'Angelina', lastName: 'Sy', spec: 'IM Car', freq: 2, pattern: 'W1W3', day: 5, hosp: 'Iloilo Doctors Hospital', eng: 2, programs: ['REBATES / MONEY'] },
  { firstName: 'Renato', lastName: 'Mapa', spec: 'Derma', freq: 2, pattern: 'W2W4', day: 5, hosp: 'Western Visayas Medical Center', eng: 1 },
];

const lapazDoctors = [
  // ── Monday (day 1) ──
  { firstName: 'Corazon', lastName: 'Pascual', spec: 'Pedia', freq: 4, day: 1, hosp: 'Iloilo Doctors Hospital', eng: 5, programs: ['CME GRANT', 'REST AND RECREATION'], support: ['STARTER DOSES', 'PROMATS'], birthday: '1969-02-14', notes: 'Long-time partner. Always receptive to new programs.' },
  { firstName: 'Nestor', lastName: 'Galang', spec: 'IM Car', freq: 4, day: 1, hosp: 'Western Visayas Medical Center', eng: 3, support: ['FULL DOSE'] },
  { firstName: 'Felisa', lastName: 'De Leon', spec: 'IM Gastro', freq: 2, pattern: 'W1W3', day: 1, hosp: 'St. Paul\'s Hospital', eng: 2, support: ['PATIENT DISCOUNT'] },
  { firstName: 'Leandro', lastName: 'Escano', spec: 'ENT', freq: 2, pattern: 'W2W4', day: 1, hosp: 'Iloilo Mission Hospital', eng: 4, programs: ['MED SOCIETY PARTICIPATION'], support: ['AIR FRESHENER'], secName: 'Lorna Reyes', secPhone: '+63 9171236001' },
  // ── Tuesday (day 2) ──
  { firstName: 'Milagros', lastName: 'Ponce', spec: 'Derma', freq: 4, day: 2, hosp: 'Medicus Medical Center', eng: 4, programs: ['REST AND RECREATION'], support: ['PROMATS', 'FULL DOSE'] },
  { firstName: 'Oscar', lastName: 'Sison', spec: 'Surg', freq: 4, day: 2, hosp: 'Metro Iloilo Hospital', eng: 3, support: ['STARTER DOSES'], birthday: '1981-06-30' },
  { firstName: 'Esperanza', lastName: 'Abad', spec: 'IM', freq: 2, pattern: 'W1W3', day: 2, hosp: 'Iloilo Doctors Hospital', eng: 2, programs: ['REBATES / MONEY'] },
  { firstName: 'Virgilio', lastName: 'Jimenez', spec: 'Pulmo', freq: 2, pattern: 'W2W4', day: 2, hosp: 'Western Visayas Medical Center', eng: 1, support: ['PATIENT DISCOUNT'] },
  // ── Wednesday (day 3) ──
  { firstName: 'Natividad', lastName: 'Luna', spec: 'GP', freq: 4, day: 3, hosp: 'St. Paul\'s Hospital', eng: 4, programs: ['CME GRANT'], support: ['PROMATS'], secName: 'Cora Abad', secPhone: '+63 9191236003' },
  { firstName: 'Hernando', lastName: 'Solis', spec: 'IM Car', freq: 4, day: 3, hosp: 'Iloilo Mission Hospital', eng: 3, programs: ['MED SOCIETY PARTICIPATION'], support: ['FULL DOSE'] },
  { firstName: 'Amelia', lastName: 'Castro', spec: 'Pedia', freq: 2, pattern: 'W1W3', day: 3, hosp: 'Medicus Medical Center', eng: 2, support: ['STARTER DOSES'] },
  { firstName: 'Teodoro', lastName: 'Lara', spec: 'Derma', freq: 2, pattern: 'W2W4', day: 3, hosp: 'Metro Iloilo Hospital', eng: 4, programs: ['REST AND RECREATION'] },
  // ── Thursday (day 4) ──
  { firstName: 'Josefina', lastName: 'Abaya', spec: 'ENT', freq: 4, day: 4, hosp: 'Iloilo Doctors Hospital', eng: 3, support: ['STARTER DOSES', 'PATIENT DISCOUNT'], birthday: '1977-10-18' },
  { firstName: 'Domingo', lastName: 'Enriquez', spec: 'IM Gastro', freq: 4, day: 4, hosp: 'Western Visayas Medical Center', eng: 5, programs: ['CME GRANT', 'REBATES / MONEY'], support: ['FULL DOSE'], secName: 'Tessie Go', secPhone: '+63 9201236004', notes: 'Key opinion leader. Valuable for product launches.' },
  { firstName: 'Concepcion', lastName: 'Alba', spec: 'Pulmo', freq: 2, pattern: 'W1W3', day: 4, hosp: 'St. Paul\'s Hospital', eng: 1 },
  { firstName: 'Alfredo', lastName: 'Tugade', spec: 'Surg', freq: 2, pattern: 'W2W4', day: 4, hosp: 'Iloilo Mission Hospital', eng: 2, support: ['AIR FRESHENER'] },
  // ── Friday (day 5) ──
  { firstName: 'Imelda', lastName: 'Viray', spec: 'IM', freq: 4, day: 5, hosp: 'Medicus Medical Center', eng: 4, programs: ['MED SOCIETY PARTICIPATION', 'CME GRANT'], support: ['PROMATS', 'FULL DOSE'] },
  { firstName: 'Gerardo', lastName: 'Sotto', spec: 'GP', freq: 4, day: 5, hosp: 'Metro Iloilo Hospital', eng: 3, support: ['STARTER DOSES'], anniversary: '2018-11-20' },
  { firstName: 'Luzviminda', lastName: 'Dy', spec: 'IM Car', freq: 2, pattern: 'W1W3', day: 5, hosp: 'Iloilo Doctors Hospital', eng: 2, programs: ['REBATES / MONEY'] },
  { firstName: 'Rogelio', lastName: 'Balbin', spec: 'Derma', freq: 2, pattern: 'W2W4', day: 5, hosp: 'Western Visayas Medical Center', eng: 1 },
];

// Map territory name → doctor list
const territoryDoctors = {
  'Jaro': jaroDoctors,
  'Mandurriao': mandurriaoDoctors,
  'La Paz': lapazDoctors,
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
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_DATA_SCRIPTS !== 'true') {
    console.error('Refusing to run seed in production. Set ALLOW_PROD_DATA_SCRIPTS=true to override.');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected for seeding...');

    // Seed CRM products
    console.log('Seeding CRM products...');
    const crmProductData = [
      {
        name: 'CardioVex 80mg',
        genericName: 'Valsartan',
        dosage: '80mg tablet',
        category: 'Cardiovascular',
        description: 'Angiotensin II receptor blocker (ARB) for hypertension and heart failure management. Helps relax blood vessels to lower blood pressure and improve blood flow.',
        usage: 'Take one tablet daily with or without food. Swallow whole with water. Do not crush or chew. Best taken at the same time each day.',
        safety: 'Not for use during pregnancy. May cause dizziness. Avoid potassium supplements unless directed by physician. Monitor kidney function regularly.',
        targetSpecializations: ['IM Car', 'IM', 'IM Gastro'],
        isActive: true,
      },
      {
        name: 'GastroShield 20mg',
        genericName: 'Omeprazole',
        dosage: '20mg capsule',
        category: 'Gastrointestinal',
        description: 'Proton pump inhibitor (PPI) for treatment of gastroesophageal reflux disease (GERD), peptic ulcers, and Zollinger-Ellison syndrome.',
        usage: 'Take one capsule 30 minutes before breakfast. Swallow whole — do not crush, chew, or open capsule. Course duration as prescribed.',
        safety: 'Long-term use may affect magnesium and calcium absorption. Report any bone pain or muscle cramps. Not recommended for more than 8 weeks without medical review.',
        targetSpecializations: ['IM Gastro', 'IM', 'GP'],
        isActive: true,
      },
      {
        name: 'RespiraClear 10mg',
        genericName: 'Montelukast Sodium',
        dosage: '10mg chewable tablet',
        category: 'Respiratory',
        description: 'Leukotriene receptor antagonist for prevention and long-term treatment of asthma. Also relieves symptoms of allergic rhinitis.',
        usage: 'Take one tablet in the evening, with or without food. For asthma: take daily even when symptom-free. Chewable tablet may be chewed or swallowed whole.',
        safety: 'Report any mood or behavior changes immediately. Not for acute asthma attacks — use rescue inhaler. Safe for patients 6 years and older.',
        targetSpecializations: ['Pulmo', 'Pedia', 'ENT'],
        isActive: true,
      },
      {
        name: 'NeuroCalm 25mg',
        genericName: 'Pregabalin',
        dosage: '25mg capsule',
        category: 'Neurological',
        description: 'Anticonvulsant and analgesic for neuropathic pain, fibromyalgia, and as adjunctive therapy for partial-onset seizures.',
        usage: 'Take 25-75mg twice daily. May be taken with or without food. Do not stop abruptly — taper dose gradually over at least one week.',
        safety: 'May cause drowsiness and dizziness. Avoid alcohol. Do not drive until you know how it affects you. Report any swelling, weight gain, or vision changes.',
        targetSpecializations: ['Internal Medicine', 'General Practice'],
        isActive: true,
      },
      {
        name: 'DermaHeal Cream 0.1%',
        genericName: 'Mometasone Furoate',
        dosage: '0.1% topical cream 15g',
        category: 'Dermatology',
        description: 'Medium-potency topical corticosteroid for inflammatory and pruritic skin conditions including eczema, psoriasis, and dermatitis.',
        usage: 'Apply a thin layer to affected area once daily. Do not cover with occlusive dressing unless directed. Wash hands after application.',
        safety: 'For external use only. Avoid contact with eyes. Do not use on broken skin or infected areas. Limit use to 2-3 weeks on face. Discontinue if irritation occurs.',
        targetSpecializations: ['Dermatology'],
        isActive: true,
      },
      {
        name: 'ImmunoBoost 500mg',
        genericName: 'Ascorbic Acid + Zinc',
        dosage: '500mg/10mg tablet',
        category: 'Vitamins & Supplements',
        description: 'Vitamin C and Zinc combination supplement for immune system support. Helps reduce duration and severity of common colds.',
        usage: 'Take one tablet daily after meals. May be taken with water or juice. For enhanced immune support during illness, take up to 3 tablets daily.',
        safety: 'Generally well-tolerated. High doses may cause stomach upset. Not a substitute for a balanced diet. Consult physician if pregnant or breastfeeding.',
        targetSpecializations: ['Pediatrics', 'General Practice', 'Internal Medicine'],
        isActive: true,
      },
    ];

    const crmProducts = await CrmProduct.insertMany(crmProductData);
    console.log(`  Created ${crmProducts.length} CRM products`);

    // Clear existing data
    console.log('Clearing existing data...');
    await Promise.all([
      User.deleteMany({}),
      Doctor.deleteMany({}),
      Schedule.deleteMany({}),
      Visit.deleteMany({}),
      Client.deleteMany({}),
      ClientVisit.deleteMany({}),
      ProductAssignment.deleteMany({}),
      CrmProduct.deleteMany({}),
    ]);

    // 1. Create Admin
    console.log('Creating admin user...');
    await User.create({
      name: 'System Administrator',
      email: 'admin@vipcrm.com',
      password: 'Admin123!@#',
      role: 'admin',
      isActive: true,
    });
    console.log('  Admin created: admin@vipcrm.com');

    // 2. Create BDM Employees
    console.log('Creating BDM employees...');
    const employees = [];
    for (const emp of employeeData) {
      const user = await User.create({
        name: emp.name,
        email: emp.email,
        password: 'BDM123!@#',
        role: 'employee',
        isActive: true,
      });
      employees.push({ user, territory: emp.territory });
      console.log(`  BDM created: ${emp.email} → ${emp.territory}`);
    }

    // 3. Create Doctors + Schedule
    console.log('Creating VIP Clients and schedule...');
    const today = new Date(2026, 1, 27); // Feb 27, 2026
    const currentCycleNumber = getCycleNumber(today);
    const cycleStart = getCycleStartDate(currentCycleNumber);
    let totalDoctors = 0;
    let totalScheduleEntries = 0;

    const statusCounts = { completed: 0, carried: 0, missed: 0, planned: 0 };
    // Track created doctors with their BDM for product assignment
    const createdDoctors = [];

    for (const { user: employee, territory } of employees) {
      const doctorDefs = territoryDoctors[territory];
      if (!doctorDefs) continue;

      for (let docIdx = 0; docIdx < doctorDefs.length; docIdx++) {
        const def = doctorDefs[docIdx];

        // Create the Doctor document
        const doctorData = {
          firstName: def.firstName,
          lastName: def.lastName,
          specialization: def.spec,
          clinicOfficeAddress: def.hosp,
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
        createdDoctors.push({ doctor, employee });
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

    // 4. Assign products to doctors
    console.log('\nAssigning products to VIP Clients...');
    let assignmentCount = 0;
    const statuses = ['showcasing', 'accepted'];

    for (const { doctor, employee } of createdDoctors) {
      // Pick 3 products (rotating through available products)
      const offset = assignmentCount % crmProducts.length;
      const picked = [];
      for (let i = 0; i < 3; i++) {
        picked.push(crmProducts[(offset + i) % crmProducts.length]);
      }

      // Set targetProducts on doctor
      doctor.targetProducts = picked.map((p, i) => ({
        product: p._id,
        status: i === 0 ? 'accepted' : statuses[i % statuses.length],
      }));
      await doctor.save();

      // Create ProductAssignment records
      for (let i = 0; i < picked.length; i++) {
        try {
          await ProductAssignment.create({
            product: picked[i]._id,
            doctor: doctor._id,
            assignedBy: employee._id,
            priority: i + 1,
            status: 'active',
          });
        } catch (dupErr) {
          // skip duplicates
        }
      }
      assignmentCount++;
    }
    console.log(`  Assigned 3 products each to ${assignmentCount} VIP Clients`);
    console.log(`  Created ${assignmentCount * 3} ProductAssignment records`);

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
