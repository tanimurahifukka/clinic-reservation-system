-- Migration to add payment, insurance, cancellation policy, QR code, and waiting time management tables

-- Payment methods table
CREATE TABLE payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- credit_card, bank_transfer, cash, digital_wallet
    provider VARCHAR(100), -- stripe, square, paypay, line_pay
    token VARCHAR(500), -- encrypted payment token
    last_four VARCHAR(4), -- last 4 digits for cards
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Payments table
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'JPY',
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, completed, failed, refunded, partially_refunded
    payment_type VARCHAR(50) NOT NULL, -- booking_fee, consultation_fee, cancellation_fee
    payment_intent_id VARCHAR(255), -- external payment provider ID
    receipt_url VARCHAR(500),
    refund_amount DECIMAL(10,2) DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insurance information table
CREATE TABLE insurance_info (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    insurance_number VARCHAR(100) NOT NULL,
    insurance_provider VARCHAR(255),
    insurance_type VARCHAR(50), -- national, social, private
    valid_from DATE,
    valid_until DATE,
    coverage_percentage INTEGER DEFAULT 70,
    insurance_card_image_url VARCHAR(500),
    verification_status VARCHAR(50) DEFAULT 'pending', -- pending, verified, expired, invalid
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Cancellation policies table
CREATE TABLE cancellation_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    service_type_id UUID REFERENCES service_types(id) ON DELETE CASCADE,
    hours_before INTEGER NOT NULL, -- hours before appointment
    fee_percentage INTEGER NOT NULL, -- percentage of total fee
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Cancellation records table
CREATE TABLE cancellation_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    cancelled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    cancellation_reason TEXT,
    cancellation_type VARCHAR(50) NOT NULL, -- patient_request, clinic_request, no_show, emergency
    cancellation_fee DECIMAL(10,2) DEFAULT 0,
    fee_waived BOOLEAN DEFAULT false,
    waive_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- No-show tracking table
CREATE TABLE no_show_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- QR codes table for questionnaire integration
CREATE TABLE qr_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL, -- questionnaire, booking, payment
    reference_id UUID NOT NULL, -- ID of the related entity
    code VARCHAR(500) NOT NULL UNIQUE,
    data JSONB NOT NULL, -- encrypted data
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Waiting time management table
CREATE TABLE waiting_times (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES doctors(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    time_slot TIME NOT NULL,
    estimated_wait_minutes INTEGER NOT NULL DEFAULT 0,
    actual_wait_minutes INTEGER,
    patients_ahead INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'estimated', -- estimated, in_progress, completed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Real-time queue status
CREATE TABLE queue_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    queue_number INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'waiting', -- waiting, in_consultation, completed, skipped
    checked_in_at TIMESTAMP WITH TIME ZONE,
    called_at TIMESTAMP WITH TIME ZONE,
    consultation_started_at TIMESTAMP WITH TIME ZONE,
    consultation_ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Multi-language content table
CREATE TABLE translations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(100) NOT NULL, -- service_type, questionnaire, notification_template
    entity_id UUID NOT NULL,
    language_code VARCHAR(10) NOT NULL, -- ja, en, zh, ko
    field_name VARCHAR(100) NOT NULL,
    translated_content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(entity_type, entity_id, language_code, field_name)
);

-- Notification templates table
CREATE TABLE notification_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL, -- booking_confirmation, reminder_24h, reminder_2h, cancellation, etc.
    channel VARCHAR(50) NOT NULL, -- email, sms, line
    language_code VARCHAR(10) NOT NULL DEFAULT 'ja',
    subject VARCHAR(500),
    template_body TEXT NOT NULL,
    variables JSONB DEFAULT '[]', -- list of available variables
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- EMR integration logs
CREATE TABLE emr_sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sync_type VARCHAR(50) NOT NULL, -- patient_data, appointment, questionnaire
    reference_id UUID NOT NULL,
    emr_system VARCHAR(100) NOT NULL, -- orca, medicom, etc.
    sync_status VARCHAR(50) NOT NULL, -- pending, success, failed
    sync_data JSONB,
    error_message TEXT,
    synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add new columns to existing tables
ALTER TABLE patients 
    ADD COLUMN preferred_language VARCHAR(10) DEFAULT 'ja',
    ADD COLUMN accessibility_needs JSONB DEFAULT '{}',
    ADD COLUMN insurance_info_id UUID REFERENCES insurance_info(id) ON DELETE SET NULL;

ALTER TABLE bookings 
    ADD COLUMN payment_status VARCHAR(50) DEFAULT 'pending',
    ADD COLUMN total_amount DECIMAL(10,2),
    ADD COLUMN insurance_coverage_amount DECIMAL(10,2),
    ADD COLUMN patient_payment_amount DECIMAL(10,2),
    ADD COLUMN cancellation_policy_accepted BOOLEAN DEFAULT false,
    ADD COLUMN check_in_time TIMESTAMP WITH TIME ZONE,
    ADD COLUMN actual_start_time TIMESTAMP WITH TIME ZONE,
    ADD COLUMN actual_end_time TIMESTAMP WITH TIME ZONE;

ALTER TABLE clinics
    ADD COLUMN supported_languages JSONB DEFAULT '["ja"]',
    ADD COLUMN payment_settings JSONB DEFAULT '{}',
    ADD COLUMN waiting_time_settings JSONB DEFAULT '{}';

ALTER TABLE questionnaire_responses
    ADD COLUMN qr_code_id UUID REFERENCES qr_codes(id) ON DELETE SET NULL,
    ADD COLUMN emr_sync_status VARCHAR(50) DEFAULT 'pending';

-- Create indexes for new tables
CREATE INDEX idx_payment_methods_patient_id ON payment_methods(patient_id);
CREATE INDEX idx_payments_booking_id ON payments(booking_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_insurance_info_patient_id ON insurance_info(patient_id);
CREATE INDEX idx_cancellation_policies_clinic_id ON cancellation_policies(clinic_id);
CREATE INDEX idx_cancellation_records_patient_id ON cancellation_records(patient_id);
CREATE INDEX idx_no_show_records_patient_id ON no_show_records(patient_id);
CREATE INDEX idx_qr_codes_type_reference ON qr_codes(type, reference_id);
CREATE INDEX idx_qr_codes_code ON qr_codes(code);
CREATE INDEX idx_waiting_times_clinic_date ON waiting_times(clinic_id, date);
CREATE INDEX idx_queue_status_booking_id ON queue_status(booking_id);
CREATE INDEX idx_translations_entity ON translations(entity_type, entity_id, language_code);
CREATE INDEX idx_notification_templates_clinic_type ON notification_templates(clinic_id, type, channel);
CREATE INDEX idx_emr_sync_logs_reference ON emr_sync_logs(sync_type, reference_id);

-- Apply updated_at triggers to new tables
CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON payment_methods FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_insurance_info_updated_at BEFORE UPDATE ON insurance_info FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cancellation_policies_updated_at BEFORE UPDATE ON cancellation_policies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cancellation_records_updated_at BEFORE UPDATE ON cancellation_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_qr_codes_updated_at BEFORE UPDATE ON qr_codes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_waiting_times_updated_at BEFORE UPDATE ON waiting_times FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_queue_status_updated_at BEFORE UPDATE ON queue_status FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_translations_updated_at BEFORE UPDATE ON translations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notification_templates_updated_at BEFORE UPDATE ON notification_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_emr_sync_logs_updated_at BEFORE UPDATE ON emr_sync_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();