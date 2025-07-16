-- Seed data for clinic reservation system
-- This migration inserts initial test data

-- Insert sample clinic
INSERT INTO clinics (id, name, address, phone, email, settings) VALUES 
(
    '550e8400-e29b-41d4-a716-446655440000',
    'サンプルクリニック',
    '東京都渋谷区渋谷1-1-1',
    '03-1234-5678',
    'info@sample-clinic.jp',
    '{
        "timezone": "Asia/Tokyo",
        "booking_advance_days": 30,
        "cancellation_hours": 24,
        "reminder_hours": [24, 2]
    }'
);

-- Insert sample doctors
INSERT INTO doctors (id, clinic_id, name, specialization, license_number, availability_settings, active) VALUES 
(
    '550e8400-e29b-41d4-a716-446655440001',
    '550e8400-e29b-41d4-a716-446655440000',
    '田中太郎',
    '内科',
    'DOC-001',
    '{
        "max_bookings_per_day": 20,
        "break_duration_minutes": 15,
        "online_consultation": true
    }',
    true
),
(
    '550e8400-e29b-41d4-a716-446655440002',
    '550e8400-e29b-41d4-a716-446655440000',
    '佐藤花子',
    '皮膚科',
    'DOC-002',
    '{
        "max_bookings_per_day": 15,
        "break_duration_minutes": 10,
        "online_consultation": false
    }',
    true
);

-- Insert sample service types
INSERT INTO service_types (id, clinic_id, name, description, default_duration, price, requires_questionnaire, supports_online, settings) VALUES 
(
    '550e8400-e29b-41d4-a716-446655440010',
    '550e8400-e29b-41d4-a716-446655440000',
    '一般診療',
    '一般的な診察・相談',
    30,
    3000.00,
    true,
    true,
    '{
        "preparation_time": 5,
        "cleanup_time": 5
    }'
),
(
    '550e8400-e29b-41d4-a716-446655440011',
    '550e8400-e29b-41d4-a716-446655440000',
    '健康診断',
    '定期健康診断',
    60,
    8000.00,
    true,
    false,
    '{
        "preparation_time": 10,
        "cleanup_time": 10
    }'
),
(
    '550e8400-e29b-41d4-a716-446655440012',
    '550e8400-e29b-41d4-a716-446655440000',
    '美容治療',
    'レーザー治療等の美容医療',
    45,
    15000.00,
    true,
    false,
    '{
        "preparation_time": 15,
        "cleanup_time": 15,
        "series_treatment": true,
        "recommended_sessions": 5,
        "interval_days": 14
    }'
);

-- Insert sample patients
INSERT INTO patients (id, name, phone, email, birth_date, gender, notification_preferences) VALUES 
(
    '550e8400-e29b-41d4-a716-446655440020',
    '山田太郎',
    '090-1234-5678',
    'yamada@example.com',
    '1985-05-15',
    'male',
    '{
        "email_notifications": true,
        "sms_notifications": true,
        "line_notifications": false,
        "reminder_24h": true,
        "reminder_2h": true
    }'
),
(
    '550e8400-e29b-41d4-a716-446655440021',
    '鈴木花子',
    '090-9876-5432',
    'suzuki@example.com',
    '1990-08-22',
    'female',
    '{
        "email_notifications": true,
        "sms_notifications": false,
        "line_notifications": true,
        "reminder_24h": true,
        "reminder_2h": false
    }'
);

-- Insert clinic schedules (Monday to Friday, 9:00-17:00)
INSERT INTO clinic_schedules (clinic_id, day_of_week, start_time, end_time, is_active) VALUES 
('550e8400-e29b-41d4-a716-446655440000', 1, '09:00:00', '17:00:00', true), -- Monday
('550e8400-e29b-41d4-a716-446655440000', 2, '09:00:00', '17:00:00', true), -- Tuesday
('550e8400-e29b-41d4-a716-446655440000', 3, '09:00:00', '17:00:00', true), -- Wednesday
('550e8400-e29b-41d4-a716-446655440000', 4, '09:00:00', '17:00:00', true), -- Thursday
('550e8400-e29b-41d4-a716-446655440000', 5, '09:00:00', '17:00:00', true), -- Friday
('550e8400-e29b-41d4-a716-446655440000', 6, '09:00:00', '12:00:00', true); -- Saturday (half day)

-- Insert doctor schedules
-- Dr. Tanaka (Monday, Wednesday, Friday)
INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, is_active) VALUES 
('550e8400-e29b-41d4-a716-446655440001', 1, '09:00:00', '17:00:00', true), -- Monday
('550e8400-e29b-41d4-a716-446655440001', 3, '09:00:00', '17:00:00', true), -- Wednesday
('550e8400-e29b-41d4-a716-446655440001', 5, '09:00:00', '17:00:00', true); -- Friday

-- Dr. Sato (Tuesday, Thursday, Saturday)
INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, is_active) VALUES 
('550e8400-e29b-41d4-a716-446655440002', 2, '09:00:00', '17:00:00', true), -- Tuesday
('550e8400-e29b-41d4-a716-446655440002', 4, '09:00:00', '17:00:00', true), -- Thursday
('550e8400-e29b-41d4-a716-446655440002', 6, '09:00:00', '12:00:00', true); -- Saturday

-- Insert sample questionnaire
INSERT INTO questionnaires (id, service_type_id, title, questions, is_active) VALUES 
(
    '550e8400-e29b-41d4-a716-446655440030',
    '550e8400-e29b-41d4-a716-446655440010',
    '一般診療問診票',
    '[
        {
            "id": "symptoms",
            "type": "checkbox",
            "question": "現在の症状を選択してください",
            "options": ["発熱", "咳", "頭痛", "腹痛", "その他"],
            "required": true
        },
        {
            "id": "duration",
            "type": "select",
            "question": "症状はいつから続いていますか？",
            "options": ["今日から", "2-3日前から", "1週間前から", "それ以上前から"],
            "required": true
        },
        {
            "id": "medications",
            "type": "text",
            "question": "現在服用中の薬があれば記入してください",
            "required": false
        },
        {
            "id": "allergies",
            "type": "text",
            "question": "アレルギーがあれば記入してください",
            "required": false
        }
    ]',
    true
);

-- Insert sample special dates (holidays)
INSERT INTO special_dates (clinic_id, date, type, description) VALUES 
('550e8400-e29b-41d4-a716-446655440000', '2024-01-01', 'holiday', '元日'),
('550e8400-e29b-41d4-a716-446655440000', '2024-01-08', 'holiday', '成人の日'),
('550e8400-e29b-41d4-a716-446655440000', '2024-02-11', 'holiday', '建国記念の日'),
('550e8400-e29b-41d4-a716-446655440000', '2024-02-23', 'holiday', '天皇誕生日'),
('550e8400-e29b-41d4-a716-446655440000', '2024-03-20', 'holiday', '春分の日'),
('550e8400-e29b-41d4-a716-446655440000', '2024-04-29', 'holiday', '昭和の日'),
('550e8400-e29b-41d4-a716-446655440000', '2024-05-03', 'holiday', '憲法記念日'),
('550e8400-e29b-41d4-a716-446655440000', '2024-05-04', 'holiday', 'みどりの日'),
('550e8400-e29b-41d4-a716-446655440000', '2024-05-05', 'holiday', 'こどもの日');