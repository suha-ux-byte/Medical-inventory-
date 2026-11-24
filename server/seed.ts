import { db, syncMedicineInventoryAggregate } from './db.ts';
import { hashPassword, syncOrganizationAlerts } from './auth.ts';
import { addDaysIso } from '../src/lib/expiry.ts';

export function seedDemoDataIfEmpty(): void {
  const existingOrg = db.prepare('SELECT COUNT(*) AS count FROM organizations').get() as { count: number };
  if (existingOrg.count > 0) {
    return;
  }

  const now = new Date();
  const demoPasswordHash = hashPassword('DemoPass@2026');

  const orgs = [
    {
      orgCode: 'DEMO-ORG-001',
      name: 'Mercy General Hospital [Demo]',
      orgType: 'Hospital',
      registrationNumber: 'DEMO-REG-HOSP-401',
      address: '450 Clinical Plaza, Suite 200',
      city: 'Seattle',
      state: 'WA',
      contactPerson: 'Dr. Elena Rostova',
      phone: '(206) 555-0142',
      email: 'pharmacy@mercy-demo.medistock.local',
      verificationStatus: 'Demo Sandbox',
    },
    {
      orgCode: 'DEMO-ORG-002',
      name: 'Cascade Regional Pharmacy [Demo]',
      orgType: 'Pharmacy',
      registrationNumber: 'DEMO-REG-PHAR-812',
      address: '1120 Harborview Blvd',
      city: 'Portland',
      state: 'OR',
      contactPerson: 'Marcus Vance, PharmD',
      phone: '(503) 555-0198',
      email: 'supply@cascade-demo.medistock.local',
      verificationStatus: 'Demo Sandbox',
    },
    {
      orgCode: 'DEMO-ORG-003',
      name: 'Pacific Community Clinic [Demo]',
      orgType: 'Clinic',
      registrationNumber: 'DEMO-REG-CLIN-229',
      address: '780 Oakridge Avenue',
      city: 'Tacoma',
      state: 'WA',
      contactPerson: 'Sarah Jenkins, RN',
      phone: '(253) 555-0164',
      email: 'inventory@pacificclinic-demo.medistock.local',
      verificationStatus: 'Demo Sandbox',
    },
    {
      orgCode: 'DEMO-ORG-004',
      name: 'Northstar Diagnostic Lab [Demo]',
      orgType: 'Laboratory',
      registrationNumber: 'DEMO-REG-LAB-517',
      address: '2150 Biotech Way',
      city: 'Bellevue',
      state: 'WA',
      contactPerson: 'Dr. Aris Thorne',
      phone: '(425) 555-0119',
      email: 'labops@northstar-demo.medistock.local',
      verificationStatus: 'Demo Sandbox',
    },
    {
      orgCode: 'DEMO-ORG-005',
      name: 'MedBridge Relief NGO [Demo]',
      orgType: 'Healthcare NGO',
      registrationNumber: 'DEMO-REG-NGO-903',
      address: '890 Civic Center Parkway',
      city: 'Spokane',
      state: 'WA',
      contactPerson: 'David Okafor',
      phone: '(509) 555-0177',
      email: 'logistics@medbridge-demo.medistock.local',
      verificationStatus: 'Demo Sandbox',
    },
    {
      orgCode: 'DEMO-ORG-006',
      name: 'Summit Medical Store [Demo]',
      orgType: 'Medical Store',
      registrationNumber: 'DEMO-REG-STOR-334',
      address: '305 Medical Park Drive',
      city: 'Eugene',
      state: 'OR',
      contactPerson: 'Priya Patel',
      phone: '(541) 555-0185',
      email: 'dispatch@summit-demo.medistock.local',
      verificationStatus: 'Demo Sandbox',
    },
  ];

  const insertOrg = db.prepare(
    `INSERT INTO organizations (org_code, name, org_type, registration_number, address, city, state, contact_person, phone, email, verification_status, is_demo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  );

  const orgIds: number[] = [];
  for (const o of orgs) {
    const res = insertOrg.run(
      o.orgCode,
      o.name,
      o.orgType,
      o.registrationNumber,
      o.address,
      o.city,
      o.state,
      o.contactPerson,
      o.phone,
      o.email,
      o.verificationStatus
    );
    orgIds.push(Number(res.lastInsertRowid));
  }

  const insertUser = db.prepare(
    `INSERT INTO users (organization_id, full_name, email, password_hash, role, status)
     VALUES (?, ?, ?, ?, ?, 'Active')`
  );

  // Demo accounts for all 4 roles
  const sysAdminId = Number(
    insertUser.run(orgIds[0], 'Dr. Elena Rostova (Admin)', 'admin@medistock.demo', demoPasswordHash, 'System Administrator').lastInsertRowid
  );
  const orgAdminId = Number(
    insertUser.run(orgIds[0], 'Claire Bennett', 'orgadmin@medistock.demo', demoPasswordHash, 'Organization Administrator').lastInsertRowid
  );
  const invManagerId = Number(
    insertUser.run(orgIds[0], 'Liam Chen, PharmD', 'manager@medistock.demo', demoPasswordHash, 'Inventory Manager').lastInsertRowid
  );
  insertUser.run(orgIds[0], 'Noah Alvarez', 'staff@medistock.demo', demoPasswordHash, 'Staff Member');

  const cascadeUserId = Number(
    insertUser.run(orgIds[1], 'Marcus Vance', 'cascade@medistock.demo', demoPasswordHash, 'Organization Administrator').lastInsertRowid
  );
  const pacificUserId = Number(
    insertUser.run(orgIds[2], 'Sarah Jenkins', 'pacific@medistock.demo', demoPasswordHash, 'Inventory Manager').lastInsertRowid
  );
  const northstarUserId = Number(
    insertUser.run(orgIds[3], 'Dr. Aris Thorne', 'northstar@medistock.demo', demoPasswordHash, 'Organization Administrator').lastInsertRowid
  );
  const medbridgeUserId = Number(
    insertUser.run(orgIds[4], 'David Okafor', 'medbridge@medistock.demo', demoPasswordHash, 'Inventory Manager').lastInsertRowid
  );
  const summitUserId = Number(
    insertUser.run(orgIds[5], 'Priya Patel', 'summit@medistock.demo', demoPasswordHash, 'Inventory Manager').lastInsertRowid
  );

  // Suppliers
  const insertSupplier = db.prepare(
    `INSERT INTO suppliers (organization_id, name, contact_email, phone, address) VALUES (?, ?, ?, ?, ?)`
  );
  const sup1 = Number(insertSupplier.run(orgIds[0], 'McKesson Medical-Surgical [Demo]', 'orders@mckesson-demo.local', '800-555-0101', 'Irving, TX').lastInsertRowid);
  const sup2 = Number(insertSupplier.run(orgIds[0], 'Cardinal Health Distribution [Demo]', 'supply@cardinal-demo.local', '800-555-0102', 'Dublin, OH').lastInsertRowid);
  const sup3 = Number(insertSupplier.run(orgIds[0], 'AmerisourceBergen Pharma [Demo]', 'pharma@ab-demo.local', '800-555-0103', 'Conshohocken, PA').lastInsertRowid);

  const insertMed = db.prepare(
    `INSERT INTO medicines (item_code, organization_id, name, generic_name, category, brand, unit_of_measure, reorder_level, unit_price, storage_location, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertBatch = db.prepare(
    `INSERT INTO inventory_batches (medicine_id, organization_id, supplier_id, supplier_name, batch_number, quantity_available, reserved_quantity, purchase_date, manufacturing_date, expiry_date, storage_location, unit_price, condition_status, quarantined)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  // 16 medicines in Org 1 (Mercy General Hospital) covering all 10 categories + multiple batches + varied expiries + low stock
  const org1Medicines: Array<{
    code: string;
    name: string;
    generic: string;
    category: string;
    brand: string;
    uom: string;
    reorder: number;
    price: number;
    loc: string;
    desc: string;
    batches: Array<{
      batchNo: string;
      qty: number;
      reserved?: number;
      expOffset: number;
      cond?: string;
      quarantined?: number;
      supplierId?: number;
      supplierName?: string;
    }>;
  }> = [
    {
      code: 'MED-1001',
      name: 'Amoxicillin 500mg Tablets',
      generic: 'Amoxicillin Trihydrate',
      category: 'Tablets',
      brand: 'GlaxoCare',
      uom: 'Boxes (100 tabs)',
      reorder: 40,
      price: 18.5,
      loc: 'Pharmacy Vault A-01',
      desc: 'Broad-spectrum penicillin antibiotic oral tablets.',
      batches: [
        { batchNo: 'AMX-2409A', qty: 18, expOffset: -14, supplierId: sup1, supplierName: 'McKesson Medical-Surgical [Demo]' },
        { batchNo: 'AMX-2501B', qty: 45, expOffset: 21, supplierId: sup1, supplierName: 'McKesson Medical-Surgical [Demo]' },
        { batchNo: 'AMX-2506C', qty: 180, expOffset: 240, supplierId: sup3, supplierName: 'AmerisourceBergen Pharma [Demo]' },
      ],
    },
    {
      code: 'MED-1002',
      name: 'Insulin Glargine 100 IU/mL Pens',
      generic: 'Insulin Glargine',
      category: 'Injections',
      brand: 'SanofiBio',
      uom: 'Packs (5 pens)',
      reorder: 30,
      price: 142.0,
      loc: 'Cold Chain Unit C-02 (2-8°C)',
      desc: 'Long-acting basal insulin analog pre-filled injection pens.',
      batches: [
        { batchNo: 'INS-8821X', qty: 24, expOffset: 5, cond: 'Cold Chain Verified', supplierId: sup3, supplierName: 'AmerisourceBergen Pharma [Demo]' },
        { batchNo: 'INS-8910Y', qty: 95, expOffset: 115, cond: 'Cold Chain Verified', supplierId: sup3, supplierName: 'AmerisourceBergen Pharma [Demo]' },
      ],
    },
    {
      code: 'MED-1003',
      name: 'Omeprazole 20mg DR Capsules',
      generic: 'Omeprazole',
      category: 'Capsules',
      brand: 'AstraMed',
      uom: 'Bottles (90 caps)',
      reorder: 50,
      price: 22.75,
      loc: 'Pharmacy Shelf B-14',
      desc: 'Delayed-release proton pump inhibitor capsules.',
      batches: [
        { batchNo: 'OMP-3102', qty: 140, expOffset: 48, supplierId: sup1, supplierName: 'McKesson Medical-Surgical [Demo]' },
        { batchNo: 'OMP-3390', qty: 210, expOffset: 310, supplierId: sup2, supplierName: 'Cardinal Health Distribution [Demo]' },
      ],
    },
    {
      code: 'MED-1004',
      name: 'Azithromycin Oral Suspension 200mg/5mL',
      generic: 'Azithromycin',
      category: 'Syrups',
      brand: 'PfizerCore',
      uom: 'Bottles (30mL)',
      reorder: 35,
      price: 14.2,
      loc: 'Pediatric Dispensary P-04',
      desc: 'Macrolide antibiotic pediatric oral suspension.',
      batches: [
        { batchNo: 'AZM-1104', qty: 12, expOffset: -6, supplierId: sup3, supplierName: 'AmerisourceBergen Pharma [Demo]' },
        { batchNo: 'AZM-1420', qty: 64, expOffset: 78, supplierId: sup3, supplierName: 'AmerisourceBergen Pharma [Demo]' },
      ],
    },
    {
      code: 'MED-1005',
      name: 'N95 Particulate Respirator Masks',
      generic: 'NIOSH N95 Mask',
      category: 'PPE',
      brand: '3M Clinical',
      uom: 'Boxes (20 masks)',
      reorder: 60,
      price: 28.0,
      loc: 'Central PPE Bay D-01',
      desc: 'Fluid-resistant surgical N95 particulate respirators.',
      batches: [
        { batchNo: 'PPE-9901', qty: 320, expOffset: 420, supplierId: sup2, supplierName: 'Cardinal Health Distribution [Demo]' },
        { batchNo: 'PPE-9402', qty: 85, expOffset: 26, supplierId: sup2, supplierName: 'Cardinal Health Distribution [Demo]' },
      ],
    },
    {
      code: 'MED-1006',
      name: 'Sterile Surgical Suture 3-0 Vicryl',
      generic: 'Polyglactin 910 Suture',
      category: 'Surgical Equipment',
      brand: 'EthiconPlus',
      uom: 'Boxes (36 sutures)',
      reorder: 25,
      price: 185.0,
      loc: 'OR Sterile Core S-03',
      desc: 'Absorbable braided synthetic surgical sutures with needle.',
      batches: [
        { batchNo: 'SUT-7012', qty: 72, expOffset: 54, supplierId: sup1, supplierName: 'McKesson Medical-Surgical [Demo]' },
        { batchNo: 'SUT-7340', qty: 110, expOffset: 380, supplierId: sup1, supplierName: 'McKesson Medical-Surgical [Demo]' },
      ],
    },
    {
      code: 'MED-1007',
      name: '0.9% Sodium Chloride IV Bag 1000mL',
      generic: 'Normal Saline IV',
      category: 'IV Supplies',
      brand: 'BaxterMed',
      uom: 'Cases (12 bags)',
      reorder: 45,
      price: 34.5,
      loc: 'IV Fluid Rack F-01',
      desc: 'Sterile isotonic intravenous infusion solution.',
      batches: [
        { batchNo: 'IVS-5501', qty: 28, expOffset: 16, supplierId: sup2, supplierName: 'Cardinal Health Distribution [Demo]' },
        { batchNo: 'IVS-5890', qty: 190, expOffset: 275, supplierId: sup2, supplierName: 'Cardinal Health Distribution [Demo]' },
      ],
    },
    {
      code: 'MED-1008',
      name: 'Pulse Oximeter Fingertip Sensor',
      generic: 'SpO2 Monitor Unit',
      category: 'Medical Devices',
      brand: 'MasimoPro',
      uom: 'Units',
      reorder: 15,
      price: 68.0,
      loc: 'Biomed Depot M-02',
      desc: 'Clinical-grade LED SpO2 and pulse rate monitoring device.',
      batches: [
        { batchNo: 'DEV-2024', qty: 9, expOffset: 620, supplierId: sup1, supplierName: 'McKesson Medical-Surgical [Demo]' },
      ],
    },
    {
      code: 'MED-1009',
      name: 'Sterile Trauma First Aid Dressings',
      generic: 'Hemostatic Gauze Pad',
      category: 'First Aid',
      brand: 'MedlineCare',
      uom: 'Packs (25 pads)',
      reorder: 40,
      price: 24.0,
      loc: 'ED Trauma Bay E-01',
      desc: 'Sterile absorbent trauma wound dressing pads.',
      batches: [
        { batchNo: 'FAD-4109', qty: 22, expOffset: 185, supplierId: sup2, supplierName: 'Cardinal Health Distribution [Demo]' },
      ],
    },
    {
      code: 'MED-1010',
      name: 'EDTA Vacutainer Blood Collection Tubes',
      generic: 'K2EDTA Tube 4mL',
      category: 'Laboratory Supplies',
      brand: 'BD Diagnostics',
      uom: 'Racks (100 tubes)',
      reorder: 50,
      price: 31.0,
      loc: 'Phlebotomy Supply L-02',
      desc: 'Lavender-top evacuated blood collection tubes for hematology.',
      batches: [
        { batchNo: 'LAB-6120', qty: 15, expOffset: 6, supplierId: sup1, supplierName: 'McKesson Medical-Surgical [Demo]' },
        { batchNo: 'LAB-6488', qty: 130, expOffset: 195, supplierId: sup1, supplierName: 'McKesson Medical-Surgical [Demo]' },
      ],
    },
    {
      code: 'MED-1011',
      name: 'Epinephrine 1mg/mL Auto-Injector',
      generic: 'Epinephrine USP',
      category: 'Injections',
      brand: 'MylanBio',
      uom: 'Twin Packs',
      reorder: 25,
      price: 215.0,
      loc: 'Crash Cart Vault C-01',
      desc: 'Emergency anaphylaxis intramuscular auto-injector.',
      batches: [
        { batchNo: 'EPI-9012', qty: 14, expOffset: 28, supplierId: sup3, supplierName: 'AmerisourceBergen Pharma [Demo]' },
      ],
    },
    {
      code: 'MED-1012',
      name: 'Paracetamol 500mg Caplets',
      generic: 'Acetaminophen',
      category: 'Tablets',
      brand: 'KenvueMed',
      uom: 'Boxes (1000 tabs)',
      reorder: 30,
      price: 16.0,
      loc: 'Pharmacy Shelf A-08',
      desc: 'Analgesic and antipyretic oral tablets.',
      batches: [
        { batchNo: 'PCM-1022', qty: 240, expOffset: 340, supplierId: sup2, supplierName: 'Cardinal Health Distribution [Demo]' },
      ],
    },
    {
      code: 'MED-1013',
      name: 'Nitrile Powder-Free Exam Gloves (M)',
      generic: 'Nitrile Examination Gloves',
      category: 'PPE',
      brand: 'HalyardPro',
      uom: 'Boxes (200 gloves)',
      reorder: 80,
      price: 19.5,
      loc: 'Central PPE Bay D-03',
      desc: 'Chemo-tested nitrile sterile examination gloves.',
      batches: [
        { batchNo: 'GLV-4021', qty: 42, expOffset: 82, supplierId: sup2, supplierName: 'Cardinal Health Distribution [Demo]' },
      ],
    },
    {
      code: 'MED-1014',
      name: 'Ceftriaxone 1g IV Vial',
      generic: 'Ceftriaxone Sodium',
      category: 'Injections',
      brand: 'RochePharma',
      uom: 'Boxes (10 vials)',
      reorder: 30,
      price: 49.0,
      loc: 'IV Admixture Room A-03',
      desc: 'Third-generation cephalosporin broad-spectrum antibiotic.',
      batches: [
        { batchNo: 'CEF-3310', qty: 8, expOffset: -3, supplierId: sup3, supplierName: 'AmerisourceBergen Pharma [Demo]' },
        { batchNo: 'CEF-3519', qty: 120, expOffset: 140, supplierId: sup3, supplierName: 'AmerisourceBergen Pharma [Demo]' },
      ],
    },
    {
      code: 'MED-1015',
      name: 'Doxycycline Hyclate 100mg Capsules',
      generic: 'Doxycycline',
      category: 'Capsules',
      brand: 'SandozCare',
      uom: 'Bottles (100 caps)',
      reorder: 35,
      price: 27.4,
      loc: 'Pharmacy Shelf B-09',
      desc: 'Tetracycline-class broad-spectrum antibiotic.',
      batches: [
        { batchNo: 'DOX-7812', qty: 165, expOffset: 51, supplierId: sup1, supplierName: 'McKesson Medical-Surgical [Demo]' },
      ],
    },
    {
      code: 'MED-1016',
      name: 'Lactulose 10g/15mL Oral Solution',
      generic: 'Lactulose Syrup',
      category: 'Syrups',
      brand: 'FreseniusMed',
      uom: 'Bottles (473mL)',
      reorder: 20,
      price: 15.8,
      loc: 'Pharmacy Shelf C-11',
      desc: 'Osmotic laxative and hepatic encephalopathy treatment.',
      batches: [
        { batchNo: 'LAC-2201', qty: 0, expOffset: 160, supplierId: sup2, supplierName: 'Cardinal Health Distribution [Demo]' },
      ],
    },
  ];

  const org1MedIds: number[] = [];
  const org1BatchIds: number[] = [];

  for (const m of org1Medicines) {
    const medId = Number(
      insertMed.run(
        m.code,
        orgIds[0],
        m.name,
        m.generic,
        m.category,
        m.brand,
        m.uom,
        m.reorder,
        m.price,
        m.loc,
        m.desc
      ).lastInsertRowid
    );
    org1MedIds.push(medId);

    for (const b of m.batches) {
      const batchId = Number(
        insertBatch.run(
          medId,
          orgIds[0],
          b.supplierId ?? sup1,
          b.supplierName ?? 'McKesson Medical-Surgical [Demo]',
          b.batchNo,
          b.qty,
          b.reserved ?? 0,
          addDaysIso(-90, now),
          addDaysIso(-180, now),
          addDaysIso(b.expOffset, now),
          m.loc,
          m.price,
          b.cond ?? 'Sealed / Optimal',
          b.quarantined ?? 0
        ).lastInsertRowid
      );
      org1BatchIds.push(batchId);
    }
    syncMedicineInventoryAggregate(medId);
  }

  // Partner organizations' medicines & surplus batches (for Marketplace 10+ listings)
  const partnerMeds: Array<{
    orgIdx: number;
    userId: number;
    code: string;
    name: string;
    generic: string;
    category: string;
    brand: string;
    uom: string;
    reorder: number;
    price: number;
    loc: string;
    desc: string;
    batchNo: string;
    qty: number;
    expOffset: number;
    cond: string;
    listingQty: number;
    exchangeType: 'Transfer' | 'Swap' | 'Donation';
    listingDesc: string;
    contact: string;
  }> = [
    {
      orgIdx: 1,
      userId: cascadeUserId,
      code: 'MED-2001',
      name: 'Metformin HCl 850mg Tablets',
      generic: 'Metformin Hydrochloride',
      category: 'Tablets',
      brand: 'TevaPharma',
      uom: 'Boxes (100 tabs)',
      reorder: 40,
      price: 12.5,
      loc: 'Cascade Vault A-2',
      desc: 'First-line oral antihyperglycemic agent.',
      batchNo: 'MET-5109C',
      qty: 280,
      expOffset: 72,
      cond: 'Sealed / Optimal',
      listingQty: 120,
      exchangeType: 'Transfer',
      listingDesc: 'Surplus central dispensary allocation available for immediate regional hospital transfer.',
      contact: 'Marcus Vance, PharmD · (503) 555-0198',
    },
    {
      orgIdx: 1,
      userId: cascadeUserId,
      code: 'MED-2002',
      name: 'Heparin Sodium 5000 USP/mL Vials',
      generic: 'Heparin Sodium',
      category: 'Injections',
      brand: 'PfizerHosp',
      uom: 'Packs (25 vials)',
      reorder: 20,
      price: 96.0,
      loc: 'Cascade Sterile C-1',
      desc: 'Anticoagulant sterile parenteral solution.',
      batchNo: 'HEP-8840A',
      qty: 110,
      expOffset: 44,
      cond: 'Sealed / Optimal',
      listingQty: 50,
      exchangeType: 'Swap',
      listingDesc: 'Overstocked after formulary shift; open to swap for IV fluids or PPE.',
      contact: 'Marcus Vance, PharmD · (503) 555-0198',
    },
    {
      orgIdx: 2,
      userId: pacificUserId,
      code: 'MED-3001',
      name: 'Albuterol Sulfate Inhalation Solution',
      generic: 'Albuterol Sulfate',
      category: 'Syrups',
      brand: 'NephronMed',
      uom: 'Boxes (30 vials)',
      reorder: 25,
      price: 29.0,
      loc: 'Pacific Respiratory Shelf R-1',
      desc: 'Bronchodilator nebulizer inhalation solution.',
      batchNo: 'ALB-3301P',
      qty: 160,
      expOffset: 58,
      cond: 'Sealed / Optimal',
      listingQty: 75,
      exchangeType: 'Transfer',
      listingDesc: 'Excess outpatient clinic stock with 8 weeks remaining shelf life.',
      contact: 'Sarah Jenkins, RN · (253) 555-0164',
    },
    {
      orgIdx: 2,
      userId: pacificUserId,
      code: 'MED-3002',
      name: 'Sterile Gauze Sponges 4x4 12-Ply',
      generic: 'Cotton Surgical Gauze',
      category: 'First Aid',
      brand: 'CovidienCare',
      uom: 'Cases (200 packs)',
      reorder: 30,
      price: 38.0,
      loc: 'Pacific Wound Closet W-3',
      desc: 'USP Type VII sterile surgical gauze sponges.',
      batchNo: 'GAZ-7712K',
      qty: 140,
      expOffset: 290,
      cond: 'Sealed / Optimal',
      listingQty: 60,
      exchangeType: 'Donation',
      listingDesc: 'Surplus wound care inventory offered free of charge to clinics or NGOs.',
      contact: 'Sarah Jenkins, RN · (253) 555-0164',
    },
    {
      orgIdx: 3,
      userId: northstarUserId,
      code: 'MED-4001',
      name: 'PCR Viral Transport Media Kits',
      generic: 'VTM Swab Kit',
      category: 'Laboratory Supplies',
      brand: 'ThermoBio',
      uom: 'Boxes (50 kits)',
      reorder: 30,
      price: 74.0,
      loc: 'Northstar Lab Bay L-4',
      desc: 'Sterile specimen collection swabs with 3mL viral transport medium.',
      batchNo: 'VTM-9021N',
      qty: 210,
      expOffset: 65,
      cond: 'Cold Chain Verified',
      listingQty: 90,
      exchangeType: 'Transfer',
      listingDesc: 'Excess diagnostic sampling kits ready for same-day courier handoff.',
      contact: 'Dr. Aris Thorne · (425) 555-0119',
    },
    {
      orgIdx: 3,
      userId: northstarUserId,
      code: 'MED-4002',
      name: 'Rapid Antigen Influenza A/B Test Cassettes',
      generic: 'Immunoassay Cassette',
      category: 'Laboratory Supplies',
      brand: 'AbbottDiag',
      uom: 'Boxes (25 tests)',
      reorder: 20,
      price: 112.0,
      loc: 'Northstar Cold Room L-1',
      desc: 'Point-of-care lateral flow immunoassay test kits.',
      batchNo: 'FLU-4418X',
      qty: 95,
      expOffset: 37,
      cond: 'Sealed / Optimal',
      listingQty: 40,
      exchangeType: 'Swap',
      listingDesc: 'Near-season diagnostic surplus; seeking vacutainers or N95 PPE in swap.',
      contact: 'Dr. Aris Thorne · (425) 555-0119',
    },
    {
      orgIdx: 4,
      userId: medbridgeUserId,
      code: 'MED-5001',
      name: 'Ringer Lactate IV Solution 500mL',
      generic: 'Lactated Ringers USP',
      category: 'IV Supplies',
      brand: 'B.Braun',
      uom: 'Cases (20 bags)',
      reorder: 35,
      price: 42.0,
      loc: 'MedBridge Warehouse Bay 2',
      desc: 'Balanced crystalloid intravenous resuscitation fluid.',
      batchNo: 'RLI-6610M',
      qty: 220,
      expOffset: 130,
      cond: 'Sealed / Optimal',
      listingQty: 100,
      exchangeType: 'Donation',
      listingDesc: 'Humanitarian relief surplus available for emergency departments and rural clinics.',
      contact: 'David Okafor · (509) 555-0177',
    },
    {
      orgIdx: 4,
      userId: medbridgeUserId,
      code: 'MED-5002',
      name: 'Disposable Isolation Gowns Level 2',
      generic: 'AAMI Level 2 Gown',
      category: 'PPE',
      brand: 'CardinalSafe',
      uom: 'Cases (100 gowns)',
      reorder: 40,
      price: 64.0,
      loc: 'MedBridge Warehouse Bay 5',
      desc: 'Fluid-resistant spunbond polypropylene isolation gowns.',
      batchNo: 'GWN-2109R',
      qty: 190,
      expOffset: 410,
      cond: 'Sealed / Optimal',
      listingQty: 80,
      exchangeType: 'Donation',
      listingDesc: 'Unopened pallet surplus available for immediate healthcare facility allocation.',
      contact: 'David Okafor · (509) 555-0177',
    },
    {
      orgIdx: 5,
      userId: summitUserId,
      code: 'MED-6001',
      name: 'Cefazolin 1g Sterile Powder Vials',
      generic: 'Cefazolin Sodium',
      category: 'Injections',
      brand: 'HikmaMed',
      uom: 'Boxes (25 vials)',
      reorder: 25,
      price: 58.0,
      loc: 'Summit Depot Rack S-7',
      desc: 'First-generation cephalosporin for perioperative prophylaxis.',
      batchNo: 'CFZ-1182S',
      qty: 145,
      expOffset: 49,
      cond: 'Sealed / Optimal',
      listingQty: 60,
      exchangeType: 'Transfer',
      listingDesc: 'Regional surgical stock surplus ready for immediate inter-facility transfer.',
      contact: 'Priya Patel · (541) 555-0185',
    },
    {
      orgIdx: 5,
      userId: summitUserId,
      code: 'MED-6002',
      name: 'Sterile Laparotomy Sponges 18x18',
      generic: 'Radiopaque Lap Sponge',
      category: 'Surgical Equipment',
      brand: 'MedlineOR',
      uom: 'Cases (100 sponges)',
      reorder: 20,
      price: 79.0,
      loc: 'Summit OR Supply S-2',
      desc: 'Pre-washed radiopaque sterile surgical laparotomy sponges.',
      batchNo: 'LAP-5503S',
      qty: 130,
      expOffset: 260,
      cond: 'Sealed / Optimal',
      listingQty: 50,
      exchangeType: 'Transfer',
      listingDesc: 'Sealed hospital-grade sterile surgical sponges available for redistribution.',
      contact: 'Priya Patel · (541) 555-0185',
    },
    {
      orgIdx: 5,
      userId: summitUserId,
      code: 'MED-6003',
      name: 'Digital Infrared Forehead Thermometer',
      generic: 'Non-Contact Clinical Thermometer',
      category: 'Medical Devices',
      brand: 'WelchAllyn',
      uom: 'Units',
      reorder: 10,
      price: 89.0,
      loc: 'Summit Device Cage D-1',
      desc: 'Calibrated hospital-grade non-contact infrared thermometer.',
      batchNo: 'THM-8920D',
      qty: 48,
      expOffset: 730,
      cond: 'Sealed / Optimal',
      listingQty: 15,
      exchangeType: 'Swap',
      listingDesc: 'Factory-calibrated surplus units available for device or consumable swap.',
      contact: 'Priya Patel · (541) 555-0185',
    },
  ];

  const insertListing = db.prepare(
    `INSERT INTO exchange_listings (organization_id, batch_id, medicine_id, medicine_name, category, batch_number, available_quantity, unit_of_measure, expiry_date, stock_condition, exchange_type, contact_info, description, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?)`
  );

  const partnerListingIds: number[] = [];
  const partnerBatchIds: number[] = [];

  for (const pm of partnerMeds) {
    const orgId = orgIds[pm.orgIdx];
    const medId = Number(
      insertMed.run(pm.code, orgId, pm.name, pm.generic, pm.category, pm.brand, pm.uom, pm.reorder, pm.price, pm.loc, pm.desc).lastInsertRowid
    );
    const batchId = Number(
      insertBatch.run(
        medId,
        orgId,
        null,
        'Regional Central Distributor [Demo]',
        pm.batchNo,
        pm.qty,
        0,
        addDaysIso(-60, now),
        addDaysIso(-150, now),
        addDaysIso(pm.expOffset, now),
        pm.loc,
        pm.price,
        pm.cond,
        0
      ).lastInsertRowid
    );
    syncMedicineInventoryAggregate(medId);

    const listingId = Number(
      insertListing.run(
        orgId,
        batchId,
        medId,
        pm.name,
        pm.category,
        pm.batchNo,
        pm.listingQty,
        pm.uom,
        addDaysIso(pm.expOffset, now),
        pm.cond,
        pm.exchangeType,
        pm.contact,
        pm.listingDesc,
        pm.userId
      ).lastInsertRowid
    );
    partnerListingIds.push(listingId);
    partnerBatchIds.push(batchId);
  }

  // Create 2 listings from Org 1 (Mercy General Hospital) for non-expired surplus batches (e.g., Omeprazole & Doxycycline)
  const omeprazoleBatch = db
    .prepare("SELECT b.id, b.medicine_id, b.batch_number, b.expiry_date, m.name, m.category, m.unit_of_measure FROM inventory_batches b JOIN medicines m ON m.id = b.medicine_id WHERE b.batch_number = 'OMP-3102'")
    .get() as { id: number; medicine_id: number; batch_number: string; expiry_date: string; name: string; category: string; unit_of_measure: string };

  const org1Listing1 = Number(
    insertListing.run(
      orgIds[0],
      omeprazoleBatch.id,
      omeprazoleBatch.medicine_id,
      omeprazoleBatch.name,
      omeprazoleBatch.category,
      omeprazoleBatch.batch_number,
      60,
      omeprazoleBatch.unit_of_measure,
      omeprazoleBatch.expiry_date,
      'Sealed / Optimal',
      'Transfer',
      'Liam Chen, PharmD · (206) 555-0142',
      'Surplus 20mg DR capsules batch expiring in 48 days; ready for clinic transfer.',
      invManagerId
    ).lastInsertRowid
  );

  const doxyBatch = db
    .prepare("SELECT b.id, b.medicine_id, b.batch_number, b.expiry_date, m.name, m.category, m.unit_of_measure FROM inventory_batches b JOIN medicines m ON m.id = b.medicine_id WHERE b.batch_number = 'DOX-7812'")
    .get() as { id: number; medicine_id: number; batch_number: string; expiry_date: string; name: string; category: string; unit_of_measure: string };

  const org1Listing2 = Number(
    insertListing.run(
      orgIds[0],
      doxyBatch.id,
      doxyBatch.medicine_id,
      doxyBatch.name,
      doxyBatch.category,
      doxyBatch.batch_number,
      50,
      doxyBatch.unit_of_measure,
      doxyBatch.expiry_date,
      'Sealed / Optimal',
      'Swap',
      'Liam Chen, PharmD · (206) 555-0142',
      'Surplus Doxycycline 100mg bottles available for swap.',
      invManagerId
    ).lastInsertRowid
  );

  // Sample Exchange Requests (Pending, Approved with reservation, Processing, Completed with transaction, Rejected)
  const insertReq = db.prepare(
    `INSERT INTO exchange_requests (request_code, listing_id, owner_org_id, requester_org_id, requester_user_id, requested_quantity, exchange_type, status, notes, owner_confirmed, requester_confirmed, rejection_reason, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  // 1. Incoming Pending request on Org 1's Omeprazole listing from Pacific Community Clinic
  insertReq.run(
    'EXR-2026-101',
    org1Listing1,
    orgIds[0],
    orgIds[2],
    pacificUserId,
    25,
    'Transfer',
    'Pending',
    'Outpatient GI clinic experiencing surge demand this week.',
    0,
    0,
    null,
    addDaysIso(-2, now) + ' 09:15:00',
    addDaysIso(-2, now) + ' 09:15:00'
  );

  // 2. Incoming Approved request on Org 1's Doxycycline listing from MedBridge NGO (reserves 20 units on doxyBatch)
  insertReq.run(
    'EXR-2026-102',
    org1Listing2,
    orgIds[0],
    orgIds[4],
    medbridgeUserId,
    20,
    'Swap',
    'Approved',
    'Approved for courier pickup; awaiting handover sign-off.',
    1,
    0,
    null,
    addDaysIso(-4, now) + ' 14:20:00',
    addDaysIso(-3, now) + ' 10:00:00'
  );
  db.prepare('UPDATE inventory_batches SET reserved_quantity = reserved_quantity + 20 WHERE id = ?').run(doxyBatch.id);
  syncMedicineInventoryAggregate(doxyBatch.medicine_id);

  // 3. Outgoing Pending request from Org 1 to Cascade Regional Pharmacy (Metformin)
  insertReq.run(
    'EXR-2026-103',
    partnerListingIds[0],
    orgIds[1],
    orgIds[0],
    invManagerId,
    30,
    'Transfer',
    'Pending',
    'Requested for Mercy Hospital endocrinology outpatient refill queue.',
    0,
    0,
    null,
    addDaysIso(-1, now) + ' 11:40:00',
    addDaysIso(-1, now) + ' 11:40:00'
  );

  // 4. Outgoing Approved request from Org 1 to Summit Medical Store (Cefazolin) - reserve 15 on Summit batch
  insertReq.run(
    'EXR-2026-104',
    partnerListingIds[8],
    orgIds[5],
    orgIds[0],
    orgAdminId,
    15,
    'Transfer',
    'Approved',
    'Pre-op surgical prophylaxis replenishment.',
    0,
    0,
    null,
    addDaysIso(-5, now) + ' 08:30:00',
    addDaysIso(-4, now) + ' 16:10:00'
  );
  db.prepare('UPDATE inventory_batches SET reserved_quantity = reserved_quantity + 15 WHERE id = ?').run(partnerBatchIds[8]);

  // 5. Completed exchange request & transaction (Cascade -> Mercy)
  const completedReq1 = Number(
    insertReq.run(
      'EXR-2026-098',
      partnerListingIds[1],
      orgIds[1],
      orgIds[0],
      invManagerId,
      15,
      'Swap',
      'Completed',
      'Emergency anticoagulation stock swap completed.',
      1,
      1,
      null,
      addDaysIso(-18, now) + ' 10:00:00',
      addDaysIso(-15, now) + ' 15:30:00'
    ).lastInsertRowid
  );

  db.prepare(
    `INSERT INTO exchange_transactions (transaction_code, request_id, listing_id, source_org_id, destination_org_id, medicine_name, category, batch_number, quantity_transferred, unit_of_measure, total_value, exchange_type, completed_by, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'TXN-2026-8801',
    completedReq1,
    partnerListingIds[1],
    orgIds[1],
    orgIds[0],
    'Heparin Sodium 5000 USP/mL Vials',
    'Injections',
    'HEP-8840A',
    15,
    'Packs (25 vials)',
    1440.0,
    'Swap',
    sysAdminId,
    addDaysIso(-15, now) + ' 15:30:00'
  );

  // 6. Completed exchange request & transaction (MedBridge -> Pacific Clinic)
  const completedReq2 = Number(
    insertReq.run(
      'EXR-2026-095',
      partnerListingIds[6],
      orgIds[4],
      orgIds[2],
      pacificUserId,
      25,
      'Donation',
      'Completed',
      'Community urgent care IV hydration donation.',
      1,
      1,
      null,
      addDaysIso(-26, now) + ' 09:00:00',
      addDaysIso(-24, now) + ' 13:15:00'
    ).lastInsertRowid
  );

  db.prepare(
    `INSERT INTO exchange_transactions (transaction_code, request_id, listing_id, source_org_id, destination_org_id, medicine_name, category, batch_number, quantity_transferred, unit_of_measure, total_value, exchange_type, completed_by, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'TXN-2026-8742',
    completedReq2,
    partnerListingIds[6],
    orgIds[4],
    orgIds[2],
    'Ringer Lactate IV Solution 500mL',
    'IV Supplies',
    'RLI-6610M',
    25,
    'Cases (20 bags)',
    1050.0,
    'Donation',
    medbridgeUserId,
    addDaysIso(-24, now) + ' 13:15:00'
  );

  // 7. Completed exchange request & transaction (Mercy -> Northstar Lab, 3rd completed exchange)
  const completedReq3 = Number(
    insertReq.run(
      'EXR-2026-091',
      org1Listing1,
      orgIds[0],
      orgIds[3],
      northstarUserId,
      20,
      'Transfer',
      'Completed',
      'Clinical trial support supply transfer.',
      1,
      1,
      null,
      addDaysIso(-38, now) + ' 11:00:00',
      addDaysIso(-36, now) + ' 17:00:00'
    ).lastInsertRowid
  );

  db.prepare(
    `INSERT INTO exchange_transactions (transaction_code, request_id, listing_id, source_org_id, destination_org_id, medicine_name, category, batch_number, quantity_transferred, unit_of_measure, total_value, exchange_type, completed_by, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'TXN-2026-8615',
    completedReq3,
    org1Listing1,
    orgIds[0],
    orgIds[3],
    'Omeprazole 20mg DR Capsules',
    'Capsules',
    'OMP-3102',
    20,
    'Bottles (90 caps)',
    455.0,
    'Transfer',
    invManagerId,
    addDaysIso(-36, now) + ' 17:00:00'
  );

  // Multi-month activity logs so dashboard charts show rich historical movement
  const insertLog = db.prepare(
    `INSERT INTO activity_logs (organization_id, user_id, user_name, action, entity_type, entity_id, details, quantity_delta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const historicalLogs = [
    { daysAgo: 155, action: 'Stock Received', details: 'Received Amoxicillin 500mg Tablets batch AMX-2506C', delta: 220 },
    { daysAgo: 148, action: 'Stock Dispensed', details: 'Ward pharmacy dispense for Paracetamol 500mg Caplets', delta: -65 },
    { daysAgo: 125, action: 'Stock Received', details: 'Received 0.9% Sodium Chloride IV Bag 1000mL', delta: 240 },
    { daysAgo: 118, action: 'Stock Dispensed', details: 'OR surgical suite issue for Sterile Surgical Suture', delta: -42 },
    { daysAgo: 95, action: 'Stock Received', details: 'Received N95 Particulate Respirator Masks', delta: 360 },
    { daysAgo: 88, action: 'Expiry Write-Off', details: 'Quarantined and disposed expired Syrups batch', delta: -14 },
    { daysAgo: 62, action: 'Stock Received', details: 'Cold chain delivery: Insulin Glargine 100 IU/mL Pens', delta: 120 },
    { daysAgo: 55, action: 'Stock Dispensed', details: 'Outpatient dispensary issue: Omeprazole 20mg', delta: -70 },
    { daysAgo: 36, action: 'Exchange Completed', details: 'Completed transfer TXN-2026-8615 of Omeprazole 20mg to Northstar Lab', delta: -20 },
    { daysAgo: 28, action: 'Stock Received', details: 'Received EDTA Vacutainer Blood Collection Tubes', delta: 145 },
    { daysAgo: 15, action: 'Exchange Received', details: 'Received Heparin Sodium 5000 USP/mL swap TXN-2026-8801 from Cascade', delta: 15 },
    { daysAgo: 5, action: 'Stock Dispensed', details: 'ED trauma bay restock: Sterile Trauma First Aid Dressings', delta: -18 },
    { daysAgo: 2, action: 'Exchange Requested', details: 'Pacific Community Clinic requested 25 units of Omeprazole 20mg', delta: 0 },
  ];

  for (const hl of historicalLogs) {
    insertLog.run(
      orgIds[0],
      invManagerId,
      'Liam Chen, PharmD',
      hl.action,
      'inventory',
      null,
      hl.details,
      hl.delta,
      addDaysIso(-hl.daysAgo, now) + ' 10:30:00'
    );
  }

  // Generate automatic expiry & low stock notifications + exchange alerts
  for (const orgId of orgIds) {
    syncOrganizationAlerts(orgId);
  }

  db.prepare(
    `INSERT INTO notifications (organization_id, type, severity, title, message, related_entity, related_id, is_read, created_at)
     VALUES (?, 'exchange_request', 'info', ?, ?, 'exchange_request', 1, 0, datetime('now'))`
  ).run(
    orgIds[0],
    'New Exchange Request: EXR-2026-101',
    'Pacific Community Clinic [Demo] requested 25 Bottles (90 caps) of Omeprazole 20mg DR Capsules.'
  );
}
