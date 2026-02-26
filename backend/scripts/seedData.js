/**
 * Seed Data Script
 *
 * This script populates the database with initial data:
 * - Admin user
 * - Sample regions (Panay Island hierarchy)
 * - Sample doctors
 * - Sample employees
 *
 * Note: Products are managed through the VIP Pharmacy website database,
 * not the CRM database. Use the website admin to manage products.
 *
 * Usage: npm run seed
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Region = require('../models/Region');
const Doctor = require('../models/Doctor');
const Schedule = require('../models/Schedule');
const { getCycleNumber, getCycleStartDate } = require('../utils/scheduleCycleUtils');

// Sample data
const regions = [
  // Level 1: Country
  {
    name: 'Philippines',
    code: 'PH',
    level: 'country',
    parent: null,
  },
  // Level 2: Regions (18 Philippine Regions)
  {
    name: 'Region I',
    code: 'REG-I',
    level: 'region',
    parentCode: 'PH',
  },
  {
    name: 'Region II',
    code: 'REG-II',
    level: 'region',
    parentCode: 'PH',
  },
  {
    name: 'Region III',
    code: 'REG-III',
    level: 'region',
    parentCode: 'PH',
  },
  {
    name: 'Region IV-A',
    code: 'REG-IV-A',
    level: 'region',
    parentCode: 'PH',
  },
  {
    name: 'MIMAROPA',
    code: 'MIMAROPA',
    level: 'region',
    parentCode: 'PH',
  },
  {
    name: 'Region V',
    code: 'REG-V',
    level: 'region',
    parentCode: 'PH',
  },
  {
    name: 'Region VI',
    code: 'REG-VI',
    level: 'region',
    parentCode: 'PH',
  },
  {
    name: 'Region VII',
    code: 'REG-VII',
    level: 'region',
    parentCode: 'PH',
  },
  {
    name: 'Region VIII',
    code: 'REG-VIII',
    level: 'region',
    parentCode: 'PH',
  },
  {
    name: 'Region IX',
    code: 'REG-IX',
    level: 'region',
    parentCode: 'PH',
  },
  {
    name: 'Region X',
    code: 'REG-X',
    level: 'region',
    parentCode: 'PH',
  },
  {
    name: 'Region XI',
    code: 'REG-XI',
    level: 'region',
    parentCode: 'PH',
  },
  {
    name: 'Region XII',
    code: 'REG-XII',
    level: 'region',
    parentCode: 'PH',
  },
  {
    name: 'Region XIII',
    code: 'REG-XIII',
    level: 'region',
    parentCode: 'PH',
  },
  {
    name: 'NCR',
    code: 'NCR',
    level: 'region',
    parentCode: 'PH',
  },
  {
    name: 'CAR',
    code: 'CAR',
    level: 'region',
    parentCode: 'PH',
  },
  {
    name: 'BARMM',
    code: 'BARMM',
    level: 'region',
    parentCode: 'PH',
  },
  {
    name: 'NIR',
    code: 'NIR',
    level: 'region',
    parentCode: 'PH',
  },
  // Level 3: Provinces (under Region VI - Western Visayas / Panay Island)
  {
    name: 'Iloilo',
    code: 'ILO',
    level: 'province',
    parentCode: 'REG-VI',
  },
  {
    name: 'Capiz',
    code: 'CAP',
    level: 'province',
    parentCode: 'REG-VI',
  },
  {
    name: 'Aklan',
    code: 'AKL',
    level: 'province',
    parentCode: 'REG-VI',
  },
  {
    name: 'Antique',
    code: 'ANT',
    level: 'province',
    parentCode: 'REG-VI',
  },
  // Level 4: Cities
  {
    name: 'Iloilo City',
    code: 'ILO-CITY',
    level: 'city',
    parentCode: 'ILO',
  },
  {
    name: 'Roxas City',
    code: 'ROX-CITY',
    level: 'city',
    parentCode: 'CAP',
  },
  {
    name: 'Kalibo',
    code: 'KAL',
    level: 'city',
    parentCode: 'AKL',
  },
  {
    name: 'San Jose de Buenavista',
    code: 'SJB',
    level: 'city',
    parentCode: 'ANT',
  },
  // Level 5: Districts/Areas
  {
    name: 'Jaro District',
    code: 'ILO-JARO',
    level: 'district',
    parentCode: 'ILO-CITY',
  },
  {
    name: 'Mandurriao District',
    code: 'ILO-MAND',
    level: 'district',
    parentCode: 'ILO-CITY',
  },
  {
    name: 'La Paz District',
    code: 'ILO-LPAZ',
    level: 'district',
    parentCode: 'ILO-CITY',
  },
];

const specializations = [
  'IM Gastro',
  'Pediatrics',
  'General Surgery',
  'ENT',
  'Internal Medicine',
  'Cardiology',
  'Dermatology',
  'Pulmonology',
  'General Practice',
];

const hospitals = [
  'Iloilo Doctors Hospital',
  'Western Visayas Medical Center',
  'St. Paul\'s Hospital',
  'Iloilo Mission Hospital',
  'Medicus Medical Center',
  'Metro Iloilo Hospital',
  'Roxas Memorial Provincial Hospital',
  'Capiz Emmanuel Hospital',
  'Dr. Rafael S. Tumbokon Memorial Hospital',
  'Aklan Provincial Hospital',
];

const programs = ['CME GRANT', 'REBATES / MONEY', 'REST AND RECREATION', 'MED SOCIETY PARTICIPATION'];
const supportTypes = ['STARTER DOSES', 'PROMATS', 'FULL DOSE', 'PATIENT DISCOUNT', 'AIR FRESHENER'];

// Helper to generate random doctors
const generateDoctors = (regionId, count) => {
  const doctors = [];
  const firstNames = ['Juan', 'Maria', 'Jose', 'Ana', 'Pedro', 'Rosa', 'Miguel', 'Elena', 'Carlos', 'Sofia', 'Antonio', 'Carmen', 'Rafael', 'Lucia', 'Manuel'];
  const lastNames = ['Santos', 'Reyes', 'Cruz', 'Garcia', 'Lopez', 'Martinez', 'Rodriguez', 'Hernandez', 'Gonzales', 'Perez', 'Ramos', 'Torres', 'Flores', 'Rivera', 'Gomez'];

  for (let i = 0; i < count; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const specialization = specializations[Math.floor(Math.random() * specializations.length)];
    const hospital = hospitals[Math.floor(Math.random() * hospitals.length)];
    const visitFrequency = Math.random() > 0.5 ? 4 : 2;
    const engagementLevel = Math.floor(Math.random() * 5) + 1;

    // Random subset of programs and support types
    const randomPrograms = programs.filter(() => Math.random() > 0.6);
    const randomSupport = supportTypes.filter(() => Math.random() > 0.6);

    doctors.push({
      firstName,
      lastName,
      specialization,
      clinicOfficeAddress: hospital,
      region: regionId,
      visitFrequency,
      phone: `+63 9${Math.floor(100000000 + Math.random() * 900000000)}`,
      levelOfEngagement: engagementLevel,
      programsToImplement: randomPrograms,
      supportDuringCoverage: randomSupport,
    });
  }

  return doctors;
};

// Main seed function
const seedDatabase = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected for seeding...');

    // Clear existing data (optional - comment out if you want to keep existing data)
    console.log('Clearing existing data...');
    await User.deleteMany({});
    await Region.deleteMany({});
    await Doctor.deleteMany({});
    await Schedule.deleteMany({});

    // 1. Create Regions
    console.log('Creating regions...');
    const regionMap = {};

    // First pass: create regions without parents
    for (const regionData of regions) {
      if (!regionData.parentCode) {
        const region = await Region.create({
          name: regionData.name,
          code: regionData.code,
          level: regionData.level,
          parent: null,
        });
        regionMap[regionData.code] = region._id;
        console.log(`  Created: ${regionData.name} (${regionData.code})`);
      }
    }

    // Second pass: create regions with parents
    for (const regionData of regions) {
      if (regionData.parentCode) {
        const region = await Region.create({
          name: regionData.name,
          code: regionData.code,
          level: regionData.level,
          parent: regionMap[regionData.parentCode],
        });
        regionMap[regionData.code] = region._id;
        console.log(`  Created: ${regionData.name} (${regionData.code})`);
      }
    }

    console.log(`Created ${Object.keys(regionMap).length} regions`);

    // 2. Create Admin User
    console.log('\nCreating admin user...');
    const admin = await User.create({
      name: 'System Administrator',
      email: 'admin@vipcrm.com',
      password: 'Admin123!@#',
      role: 'admin',
      canAccessAllRegions: true,
      isActive: true,
    });
    console.log(`  Admin created: ${admin.email}`);

    // 3. Create Employee Users
    console.log('\nCreating employee users...');
    const employees = [];

    const employeeData = [
      { name: 'Juan Dela Cruz', email: 'juan@vipcrm.com', regionCode: 'ILO-JARO' },
      { name: 'Maria Santos', email: 'maria@vipcrm.com', regionCode: 'ILO-MAND' },
      { name: 'Pedro Reyes', email: 'pedro@vipcrm.com', regionCode: 'ILO-LPAZ' },
    ];

    for (const empData of employeeData) {
      const employee = await User.create({
        name: empData.name,
        email: empData.email,
        password: 'BDM123!@#',
        role: 'employee',
        assignedRegions: [regionMap[empData.regionCode]],
        isActive: true,
      });
      employees.push(employee);
      console.log(`  Employee created: ${employee.email} (assigned to ${empData.regionCode})`);
    }

    // 5. Create Doctors
    console.log('\nCreating doctors...');
    let totalDoctors = 0;

    // Create doctors for each district
    const districtsToPopulate = ['ILO-JARO', 'ILO-MAND', 'ILO-LPAZ'];
    for (const districtCode of districtsToPopulate) {
      const regionId = regionMap[districtCode];
      const doctorCount = 15 + Math.floor(Math.random() * 10); // 15-25 doctors per district
      const doctors = generateDoctors(regionId, doctorCount);

      // Assign some doctors to employees
      const assignedEmployee = employees.find(e =>
        e.assignedRegions.some(r => r.toString() === regionId.toString())
      );

      for (const doctorData of doctors) {
        if (assignedEmployee) {
          doctorData.assignedTo = assignedEmployee._id;
        }
        await Doctor.create(doctorData);
        totalDoctors++;
      }
      console.log(`  Created ${doctorCount} doctors in ${districtCode}`);
    }

    console.log(`Created ${totalDoctors} total doctors`);

    // 6. Create Schedule Entries (Cycle 1)
    console.log('\nCreating schedule entries...');
    const today = new Date(2026, 1, 26); // Feb 26, 2026
    const currentCycleNumber = getCycleNumber(today);
    const cycleStart = getCycleStartDate(currentCycleNumber);
    let totalScheduleEntries = 0;
    let alternateFlag = false; // toggles W1+W3 vs W2+W4 for visitFrequency=2

    for (const employee of employees) {
      const assignedDoctors = await Doctor.find({ assignedTo: employee._id }).lean();
      let dayCounter = 1; // round-robin days 1-5

      for (const doctor of assignedDoctors) {
        const weeks = doctor.visitFrequency === 4
          ? [1, 2, 3, 4]
          : alternateFlag ? [2, 4] : [1, 3];

        for (const week of weeks) {
          const scheduledDay = dayCounter;
          dayCounter = (dayCounter % 5) + 1; // cycle 1→2→3→4→5→1

          // Determine status based on week
          let status = 'planned';
          let completedAt = null;
          let completedInWeek = null;
          let carriedToWeek = null;
          const rand = Math.random();

          if (week === 1) {
            status = rand < 0.8 ? 'completed' : 'missed';
          } else if (week === 2) {
            status = rand < 0.7 ? 'completed' : 'carried';
          } else if (week === 3) {
            status = rand < 0.6 ? 'completed' : 'carried';
          }
          // week === 4 stays 'planned'

          if (status === 'completed') {
            // Set completedAt to a date within that week
            const completedDay = Math.floor(Math.random() * 5) + 1; // random workday
            completedAt = new Date(cycleStart);
            completedAt.setDate(completedAt.getDate() + (week - 1) * 7 + (completedDay - 1));
            completedInWeek = week;
          }

          if (status === 'carried') {
            carriedToWeek = 4; // carried to current week
          }

          await Schedule.create({
            doctor: doctor._id,
            user: employee._id,
            cycleStart,
            cycleNumber: currentCycleNumber,
            scheduledWeek: week,
            scheduledDay,
            scheduledLabel: `W${week}D${scheduledDay}`,
            status,
            completedAt,
            completedInWeek,
            carriedToWeek,
          });
          totalScheduleEntries++;
        }
        alternateFlag = !alternateFlag;
      }
      console.log(`  Created schedules for ${employee.email}: ${assignedDoctors.length} doctors`);
    }

    console.log(`Created ${totalScheduleEntries} schedule entries (cycle ${currentCycleNumber})`);

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
    console.log('\nData Summary:');
    console.log('-------------');
    console.log(`Regions:   ${Object.keys(regionMap).length}`);
    console.log(`Users:     ${1 + employees.length}`);
    console.log(`Doctors:   ${totalDoctors}`);
    console.log(`Schedules: ${totalScheduleEntries} entries (cycle ${currentCycleNumber})`);
    console.log('\nNote: Products are managed via VIP Pharmacy website database.');
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

// Run the seed
seedDatabase();
