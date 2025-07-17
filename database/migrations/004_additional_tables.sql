-- Additional tables for complete functionality

-- Payment intents table
CREATE TABLE IF NOT EXISTS payment_intents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'JPY',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    stripe_payment_intent_id VARCHAR(255),
    stripe_client_secret VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Refunds table
CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    payment_intent_id UUID NOT NULL REFERENCES payment_intents(id),
    amount DECIMAL(10, 2) NOT NULL,
    reason VARCHAR(255),
    stripe_refund_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Medical histories table
CREATE TABLE IF NOT EXISTS medical_histories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    allergies JSONB,
    chronic_conditions JSONB,
    current_medications JSONB,
    past_surgeries JSONB,
    family_history JSONB,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- Blocked slots table for doctor unavailability
CREATE TABLE IF NOT EXISTS blocked_slots (
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    blocked_time TIMESTAMP NOT NULL,
    reason VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (doctor_id, blocked_time)
);

-- Cancellation fees table
CREATE TABLE IF NOT EXISTS cancellation_fees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    percentage INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    charged_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Doctor ratings table
CREATE TABLE IF NOT EXISTS doctor_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    is_anonymous BOOLEAN DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(booking_id, patient_id)
);

-- Clinic services table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS clinic_services (
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    service_type_id UUID NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (clinic_id, service_type_id)
);

-- Patient documents table
CREATE TABLE IF NOT EXISTS patient_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    document_type VARCHAR(100) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    file_size INTEGER,
    mime_type VARCHAR(100),
    uploaded_by UUID REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Notification logs table
CREATE TABLE IF NOT EXISTS notification_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_id UUID NOT NULL REFERENCES users(id),
    notification_type VARCHAR(50) NOT NULL,
    channel VARCHAR(50) NOT NULL, -- email, sms, line
    subject VARCHAR(255),
    content TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMP,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for performance
CREATE INDEX idx_payment_intents_booking_id ON payment_intents(booking_id);
CREATE INDEX idx_payment_intents_status ON payment_intents(status);
CREATE INDEX idx_medical_histories_patient_id ON medical_histories(patient_id);
CREATE INDEX idx_blocked_slots_doctor_time ON blocked_slots(doctor_id, blocked_time);
CREATE INDEX idx_doctor_ratings_doctor_id ON doctor_ratings(doctor_id);
CREATE INDEX idx_doctor_ratings_patient_id ON doctor_ratings(patient_id);
CREATE INDEX idx_patient_documents_patient_id ON patient_documents(patient_id);
CREATE INDEX idx_notification_logs_recipient_id ON notification_logs(recipient_id);
CREATE INDEX idx_notification_logs_status ON notification_logs(status);

-- Add stripe_customer_id to patients table if not exists
ALTER TABLE patients ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);

-- Add average_rating to doctors table if not exists
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS average_rating DECIMAL(3, 2) DEFAULT 0;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS total_ratings INTEGER DEFAULT 0;

-- Add payment_status to bookings table if not exists
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'pending';

-- Add profile_image_url to users table if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url VARCHAR(500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;

-- Update trigger for average rating calculation
CREATE OR REPLACE FUNCTION update_doctor_average_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE doctors
    SET average_rating = (
        SELECT AVG(rating)::DECIMAL(3,2)
        FROM doctor_ratings
        WHERE doctor_id = NEW.doctor_id
    ),
    total_ratings = (
        SELECT COUNT(*)
        FROM doctor_ratings
        WHERE doctor_id = NEW.doctor_id
    )
    WHERE id = NEW.doctor_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_doctor_rating
AFTER INSERT OR UPDATE ON doctor_ratings
FOR EACH ROW
EXECUTE FUNCTION update_doctor_average_rating();