const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'clinic_reservation',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function seedData() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🌱 Seeding test data...\n');
    
    // Create test clinic
    const clinicId = uuidv4();
    await client.query(`
      INSERT INTO clinics (id, name, address, phone, email, settings)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      clinicId,
      'テストクリニック',
      '東京都渋谷区テスト1-2-3',
      '03-1234-5678',
      'test@clinic.example.com',
      JSON.stringify({
        businessHours: {
          monday: { open: '09:00', close: '18:00' },
          tuesday: { open: '09:00', close: '18:00' },
          wednesday: { open: '09:00', close: '18:00' },
          thursday: { open: '09:00', close: '18:00' },
          friday: { open: '09:00', close: '18:00' },
          saturday: { open: '09:00', close: '13:00' },
          sunday: { closed: true }
        }
      })
    ]);
    console.log('✓ Created test clinic');
    
    // Create test doctors
    const doctor1Id = uuidv4();
    const doctor2Id = uuidv4();
    
    await client.query(`
      INSERT INTO doctors (id, clinic_id, name, specialization, license_number, active)
      VALUES 
        ($1, $2, $3, $4, $5, true),
        ($6, $2, $7, $8, $9, true)
    `, [
      doctor1Id, clinicId, '山田太郎', '内科', 'DOC-12345',
      doctor2Id, clinicId, '鈴木花子', '皮膚科', 'DOC-67890'
    ]);
    console.log('✓ Created 2 test doctors');
    
    // Create service types
    const serviceTypes = [
      { name: '一般診察', duration: 15, price: 3000, requiresQuestionnaire: false },
      { name: '健康診断', duration: 30, price: 8000, requiresQuestionnaire: true },
      { name: 'オンライン診療', duration: 15, price: 2500, supportsOnline: true },
      { name: '予防接種', duration: 10, price: 4000, requiresQuestionnaire: true },
    ];
    
    for (const service of serviceTypes) {
      await client.query(`
        INSERT INTO service_types (id, clinic_id, name, description, default_duration, price, requires_questionnaire, supports_online)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        uuidv4(),
        clinicId,
        service.name,
        `${service.name}の説明`,
        service.duration,
        service.price,
        service.requiresQuestionnaire || false,
        service.supportsOnline || false
      ]);
    }
    console.log(`✓ Created ${serviceTypes.length} service types`);
    
    // Create test patients
    const patientIds = [];
    const patients = [
      { name: '田中一郎', email: 'tanaka@example.com', phone: '090-1111-2222' },
      { name: '佐藤美咲', email: 'sato@example.com', phone: '090-3333-4444' },
      { name: '高橋健太', email: 'takahashi@example.com', phone: '090-5555-6666' },
    ];
    
    for (const patient of patients) {
      const patientId = uuidv4();
      patientIds.push(patientId);
      
      await client.query(`
        INSERT INTO patients (id, name, email, phone, birth_date, gender)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        patientId,
        patient.name,
        patient.email,
        patient.phone,
        '1990-01-01',
        'other'
      ]);
    }
    console.log(`✓ Created ${patients.length} test patients`);
    
    // Create schedules for doctors
    const daysOfWeek = [1, 2, 3, 4, 5]; // Monday to Friday
    
    for (const day of daysOfWeek) {
      await client.query(`
        INSERT INTO doctor_schedules (id, doctor_id, day_of_week, start_time, end_time, is_active)
        VALUES 
          ($1, $2, $3, $4, $5, true),
          ($6, $7, $3, $4, $5, true)
      `, [
        uuidv4(), doctor1Id, day, '09:00', '17:00',
        uuidv4(), doctor2Id, day, '10:00', '18:00'
      ]);
    }
    console.log('✓ Created doctor schedules');
    
    // Create cancellation policies
    await client.query(`
      INSERT INTO cancellation_policies (id, clinic_id, hours_before, fee_percentage, description, is_active)
      VALUES 
        ($1, $2, 24, 50, '24時間前以降のキャンセルは50%のキャンセル料が発生します', true),
        ($2, $2, 0, 100, '当日キャンセルは100%のキャンセル料が発生します', true)
    `, [uuidv4(), clinicId]);
    console.log('✓ Created cancellation policies');
    
    await client.query('COMMIT');
    console.log('\n✅ Test data seeded successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error seeding data:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  seedData().catch(console.error);
}

module.exports = { seedData };