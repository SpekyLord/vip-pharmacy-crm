/**
 * Seed Data Script
 *
 * This script populates the database with initial data:
 * - Admin user
 * - Sample regions (Panay Island hierarchy)
 * - Sample doctors
 * - Sample products
 * - Sample employees
 *
 * Usage: npm run seed
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Region = require('../models/Region');
const Doctor = require('../models/Doctor');
const Product = require('../models/Product');

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

const products = [
  {
    name: 'GastroRelief Pro',
    genericName: 'Omeprazole',
    category: 'Gastrointestinal',
    briefDescription: 'Proton pump inhibitor for acid reflux and GERD',
    description: 'GastroRelief Pro is a proton pump inhibitor that reduces stomach acid production. Effective for treating gastroesophageal reflux disease (GERD), peptic ulcers, and Zollinger-Ellison syndrome.',
    keyBenefits: [
      'Fast-acting acid relief',
      'Once-daily dosing',
      '24-hour protection',
      'Heals erosive esophagitis',
      'Reduces heartburn symptoms',
    ],
    usageInformation: 'Take one capsule daily before breakfast. For best results, take at the same time each day.',
    dosage: '20mg once daily',
    price: 45.00,
    manufacturer: 'VIP Pharma',
    image: 'https://via.placeholder.com/400x300?text=GastroRelief+Pro',
    targetSpecializations: ['IM Gastro', 'Internal Medicine', 'General Practice'],
  },
  {
    name: 'PediaGrow Plus',
    genericName: 'Multivitamin Complex',
    category: 'Pediatric',
    briefDescription: 'Complete multivitamin for children growth and development',
    description: 'PediaGrow Plus is specially formulated for children aged 2-12, providing essential vitamins and minerals for optimal growth, immune function, and cognitive development.',
    keyBenefits: [
      'Supports healthy growth',
      'Boosts immune system',
      'Enhances cognitive function',
      'Delicious orange flavor',
      'No artificial colors',
    ],
    usageInformation: 'Give one chewable tablet daily with food. Children under 4 should be supervised.',
    dosage: '1 tablet daily',
    price: 25.00,
    manufacturer: 'VIP Pharma',
    image: 'https://via.placeholder.com/400x300?text=PediaGrow+Plus',
    targetSpecializations: ['Pediatrics', 'General Practice'],
  },
  {
    name: 'CardioShield',
    genericName: 'Atorvastatin',
    category: 'Cardiovascular',
    briefDescription: 'Statin medication for cholesterol management',
    description: 'CardioShield helps lower bad cholesterol (LDL) and triglycerides while raising good cholesterol (HDL). Reduces the risk of heart attack and stroke in patients with cardiovascular risk factors.',
    keyBenefits: [
      'Lowers LDL cholesterol',
      'Reduces cardiovascular risk',
      'Once-daily convenience',
      'Well-tolerated formula',
      'Proven long-term efficacy',
    ],
    usageInformation: 'Take one tablet daily, preferably in the evening. Can be taken with or without food.',
    dosage: '10-80mg once daily',
    price: 65.00,
    manufacturer: 'VIP Pharma',
    image: 'https://via.placeholder.com/400x300?text=CardioShield',
    targetSpecializations: ['Cardiology', 'Internal Medicine', 'General Practice'],
  },
  {
    name: 'RespiClear',
    genericName: 'Salbutamol + Bromhexine',
    category: 'Respiratory',
    briefDescription: 'Bronchodilator and mucolytic combination for respiratory relief',
    description: 'RespiClear combines bronchodilator and mucolytic action for effective relief of respiratory conditions. Helps open airways and thin mucus for easier breathing.',
    keyBenefits: [
      'Dual-action formula',
      'Fast bronchodilation',
      'Effective mucus clearance',
      'Suitable for acute and chronic conditions',
      'Well-tolerated',
    ],
    usageInformation: 'Take 5ml three times daily. Shake well before use.',
    dosage: '5ml TID',
    price: 35.00,
    manufacturer: 'VIP Pharma',
    image: 'https://via.placeholder.com/400x300?text=RespiClear',
    targetSpecializations: ['Pulmonology', 'Pediatrics', 'General Practice', 'ENT'],
  },
  {
    name: 'DermaHeal Cream',
    genericName: 'Betamethasone + Clotrimazole',
    category: 'Dermatological',
    briefDescription: 'Anti-inflammatory and antifungal combination cream',
    description: 'DermaHeal Cream provides dual-action relief for inflammatory skin conditions with fungal infection. Reduces itching, redness, and scaling while eliminating fungal pathogens.',
    keyBenefits: [
      'Rapid itch relief',
      'Anti-inflammatory action',
      'Antifungal coverage',
      'Non-greasy formula',
      'Suitable for sensitive areas',
    ],
    usageInformation: 'Apply a thin layer to affected area twice daily. Do not use for more than 2 weeks without medical advice.',
    dosage: 'Apply BID',
    price: 55.00,
    manufacturer: 'VIP Pharma',
    image: 'https://via.placeholder.com/400x300?text=DermaHeal+Cream',
    targetSpecializations: ['Dermatology', 'General Practice'],
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

    doctors.push({
      name: `Dr. ${firstName} ${lastName}`,
      specialization,
      hospital,
      region: regionId,
      visitFrequency,
      phone: `+63 9${Math.floor(100000000 + Math.random() * 900000000)}`,
      address: {
        city: 'Iloilo City',
        province: 'Iloilo',
      },
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
    await Product.deleteMany({});

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
      email: 'admin@vippharmacy.com',
      password: 'Admin123!@#',
      role: 'admin',
      canAccessAllRegions: true,
      isActive: true,
    });
    console.log(`  Admin created: ${admin.email}`);

    // 3. Create MedRep User
    console.log('\nCreating medrep user...');
    const medrep = await User.create({
      name: 'Medical Representative',
      email: 'medrep@vippharmacy.com',
      password: 'Medrep123!@#',
      role: 'medrep',
      isActive: true,
    });
    console.log(`  MedRep created: ${medrep.email}`);

    // 4. Create Employee Users
    console.log('\nCreating employee users...');
    const employees = [];

    const employeeData = [
      { name: 'Juan Dela Cruz', email: 'juan@vippharmacy.com', regionCode: 'ILO-JARO' },
      { name: 'Maria Santos', email: 'maria@vippharmacy.com', regionCode: 'ILO-MAND' },
      { name: 'Pedro Reyes', email: 'pedro@vippharmacy.com', regionCode: 'ILO-LPAZ' },
    ];

    for (const empData of employeeData) {
      const employee = await User.create({
        name: empData.name,
        email: empData.email,
        password: 'Employee123!@#',
        role: 'employee',
        assignedRegions: [regionMap[empData.regionCode]],
        isActive: true,
      });
      employees.push(employee);
      console.log(`  Employee created: ${employee.email} (assigned to ${empData.regionCode})`);
    }

    // 5. Create Products
    console.log('\nCreating products...');
    for (const productData of products) {
      const product = await Product.create(productData);
      console.log(`  Product created: ${product.name}`);
    }
    console.log(`Created ${products.length} products`);

    // 6. Create Doctors
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

    // Summary
    console.log('\n========================================');
    console.log('SEED DATA COMPLETE!');
    console.log('========================================');
    console.log('\nLogin Credentials:');
    console.log('------------------');
    console.log('Admin:    admin@vippharmacy.com / Admin123!@#');
    console.log('MedRep:   medrep@vippharmacy.com / Medrep123!@#');
    console.log('Employee: juan@vippharmacy.com / Employee123!@#');
    console.log('Employee: maria@vippharmacy.com / Employee123!@#');
    console.log('Employee: pedro@vippharmacy.com / Employee123!@#');
    console.log('\nData Summary:');
    console.log('-------------');
    console.log(`Regions:   ${Object.keys(regionMap).length}`);
    console.log(`Users:     ${3 + employees.length}`);
    console.log(`Products:  ${products.length}`);
    console.log(`Doctors:   ${totalDoctors}`);
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
