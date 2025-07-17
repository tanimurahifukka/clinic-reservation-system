import Joi from 'joi';
import { getAuroraClient } from '../utils/aurora-client';
import { logger } from '../utils/logger';

export interface CreateBookingInput {
  patientId: string;
  doctorId: string;
  serviceTypeId: string;
  appointmentTime: string;
  notes?: string;
  medicalRecordNumber?: string;
  isFirstVisit?: boolean;
  symptoms?: string[];
  preferredLanguage?: string;
  paymentMethodId?: string;
  insuranceId?: string;
}

export interface UpdateBookingInput {
  appointmentTime?: string;
  notes?: string;
  serviceTypeId?: string;
  symptoms?: string[];
}

const createBookingSchema = Joi.object({
  patientId: Joi.string().uuid().required(),
  doctorId: Joi.string().uuid().required(),
  serviceTypeId: Joi.string().uuid().required(),
  appointmentTime: Joi.date().iso().greater('now').required(),
  notes: Joi.string().max(1000).optional(),
  medicalRecordNumber: Joi.string().max(50).optional(),
  isFirstVisit: Joi.boolean().optional(),
  symptoms: Joi.array().items(Joi.string()).max(10).optional(),
  preferredLanguage: Joi.string().valid('ja', 'en', 'zh', 'ko').optional(),
  paymentMethodId: Joi.string().uuid().optional(),
  insuranceId: Joi.string().uuid().optional(),
});

const updateBookingSchema = Joi.object({
  appointmentTime: Joi.date().iso().greater('now').optional(),
  notes: Joi.string().max(1000).optional(),
  serviceTypeId: Joi.string().uuid().optional(),
  symptoms: Joi.array().items(Joi.string()).max(10).optional(),
}).min(1); // At least one field must be provided

export class BookingValidator {
  private auroraClient = getAuroraClient();

  async validateCreateBooking(input: CreateBookingInput): Promise<CreateBookingInput> {
    // Validate input schema
    const { error, value } = createBookingSchema.validate(input);
    if (error) {
      throw new Error(`Validation error: ${error.details[0].message}`);
    }

    // Additional business logic validations
    await Promise.all([
      this.validateDoctor(value.doctorId),
      this.validatePatient(value.patientId),
      this.validateServiceType(value.serviceTypeId, value.doctorId),
      this.validateTimeSlot(value.doctorId, value.appointmentTime),
      value.paymentMethodId ? this.validatePaymentMethod(value.paymentMethodId, value.patientId) : null,
      value.insuranceId ? this.validateInsurance(value.insuranceId, value.patientId) : null,
    ]);

    return value;
  }

  async validateUpdateBooking(bookingId: string, input: UpdateBookingInput): Promise<UpdateBookingInput> {
    // Validate input schema
    const { error, value } = updateBookingSchema.validate(input);
    if (error) {
      throw new Error(`Validation error: ${error.details[0].message}`);
    }

    // Verify booking exists and get current data
    const booking = await this.getBooking(bookingId);
    if (!booking) {
      throw new Error('Booking not found');
    }

    // If updating appointment time, validate the new time slot
    if (value.appointmentTime) {
      await this.validateTimeSlot(booking.doctor_id, value.appointmentTime, bookingId);
    }

    // If updating service type, validate it's available for the doctor
    if (value.serviceTypeId) {
      await this.validateServiceType(value.serviceTypeId, booking.doctor_id);
    }

    return value;
  }

  private async validateDoctor(doctorId: string): Promise<void> {
    const result = await this.auroraClient.query(
      'SELECT id, is_active FROM doctors WHERE id = $1',
      [doctorId]
    );

    if (result.records.length === 0) {
      throw new Error('Doctor not found');
    }

    if (!result.records[0].is_active) {
      throw new Error('Doctor is not active');
    }
  }

  private async validatePatient(patientId: string): Promise<void> {
    const result = await this.auroraClient.query(
      'SELECT id, is_active FROM patients WHERE id = $1',
      [patientId]
    );

    if (result.records.length === 0) {
      throw new Error('Patient not found');
    }

    if (!result.records[0].is_active) {
      throw new Error('Patient account is not active');
    }
  }

  private async validateServiceType(serviceTypeId: string, doctorId: string): Promise<void> {
    // Check if service type exists and is active
    const serviceResult = await this.auroraClient.query(
      'SELECT id, is_active FROM service_types WHERE id = $1',
      [serviceTypeId]
    );

    if (serviceResult.records.length === 0) {
      throw new Error('Service type not found');
    }

    if (!serviceResult.records[0].is_active) {
      throw new Error('Service type is not active');
    }

    // Check if doctor provides this service
    const doctorServiceResult = await this.auroraClient.query(
      `SELECT 1 FROM doctor_schedules ds
       WHERE ds.doctor_id = $1 
       AND ds.service_type_id = $2 
       AND ds.is_active = true
       LIMIT 1`,
      [doctorId, serviceTypeId]
    );

    if (doctorServiceResult.records.length === 0) {
      throw new Error('Doctor does not provide this service type');
    }
  }

  private async validateTimeSlot(doctorId: string, appointmentTime: string, excludeBookingId?: string): Promise<void> {
    const appointmentDate = new Date(appointmentTime);
    const dayOfWeek = appointmentDate.getDay();
    const timeString = appointmentDate.toTimeString().slice(0, 5); // HH:MM format

    // Check if doctor has schedule for this day and time
    const scheduleResult = await this.auroraClient.query(
      `SELECT id, start_time, end_time, slot_duration_minutes 
       FROM doctor_schedules 
       WHERE doctor_id = $1 
       AND day_of_week = $2 
       AND is_active = true
       AND start_time <= $3 
       AND end_time > $3`,
      [doctorId, dayOfWeek, timeString]
    );

    if (scheduleResult.records.length === 0) {
      throw new Error('Doctor is not available at this time');
    }

    // Check if the time slot is already booked
    let conflictQuery = `
      SELECT id FROM bookings 
      WHERE doctor_id = $1 
      AND appointment_time = $2 
      AND status IN ('confirmed', 'pending')
    `;
    const params = [doctorId, appointmentTime];

    if (excludeBookingId) {
      conflictQuery += ' AND id != $3';
      params.push(excludeBookingId);
    }

    const conflictResult = await this.auroraClient.query(conflictQuery, params);

    if (conflictResult.records.length > 0) {
      throw new Error('This time slot is already booked');
    }

    // Check if appointment time is within business hours and not too far in the future
    const now = new Date();
    const maxBookingDate = new Date();
    maxBookingDate.setMonth(maxBookingDate.getMonth() + 3); // Max 3 months in advance

    if (appointmentDate > maxBookingDate) {
      throw new Error('Cannot book appointments more than 3 months in advance');
    }

    // Check if it's not too close to current time (minimum 1 hour notice)
    const minimumNotice = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
    if (appointmentDate < minimumNotice) {
      throw new Error('Appointments must be booked at least 1 hour in advance');
    }
  }

  private async validatePaymentMethod(paymentMethodId: string, patientId: string): Promise<void> {
    const result = await this.auroraClient.query(
      'SELECT id, is_active FROM payment_methods WHERE id = $1 AND patient_id = $2',
      [paymentMethodId, patientId]
    );

    if (result.records.length === 0) {
      throw new Error('Payment method not found');
    }

    if (!result.records[0].is_active) {
      throw new Error('Payment method is not active');
    }
  }

  private async validateInsurance(insuranceId: string, patientId: string): Promise<void> {
    const result = await this.auroraClient.query(
      'SELECT id, is_active, expiry_date FROM patient_insurance WHERE id = $1 AND patient_id = $2',
      [insuranceId, patientId]
    );

    if (result.records.length === 0) {
      throw new Error('Insurance information not found');
    }

    const insurance = result.records[0];
    if (!insurance.is_active) {
      throw new Error('Insurance is not active');
    }

    if (insurance.expiry_date && new Date(insurance.expiry_date) < new Date()) {
      throw new Error('Insurance has expired');
    }
  }

  private async getBooking(bookingId: string): Promise<any> {
    const result = await this.auroraClient.query(
      'SELECT * FROM bookings WHERE id = $1',
      [bookingId]
    );

    return result.records[0] || null;
  }

  async validateCancellation(bookingId: string, userId: string, userType: 'patient' | 'doctor'): Promise<any> {
    const booking = await this.getBooking(bookingId);
    
    if (!booking) {
      throw new Error('Booking not found');
    }

    // Check if user has permission to cancel
    if (userType === 'patient' && booking.patient_id !== userId) {
      throw new Error('Unauthorized to cancel this booking');
    }

    if (userType === 'doctor' && booking.doctor_id !== userId) {
      throw new Error('Unauthorized to cancel this booking');
    }

    // Check if booking can be cancelled based on status
    if (!['pending', 'confirmed'].includes(booking.status)) {
      throw new Error(`Cannot cancel booking with status: ${booking.status}`);
    }

    // Check cancellation policy
    const appointmentTime = new Date(booking.appointment_time);
    const now = new Date();
    const hoursUntilAppointment = (appointmentTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    // Get cancellation policy for the clinic
    const policyResult = await this.auroraClient.query(
      `SELECT cp.* FROM cancellation_policies cp
       JOIN doctors d ON d.clinic_id = cp.clinic_id
       WHERE d.id = $1 AND cp.is_active = true`,
      [booking.doctor_id]
    );

    if (policyResult.records.length > 0) {
      const policy = policyResult.records[0];
      
      if (hoursUntilAppointment < policy.minimum_hours_notice) {
        const penaltyPercentage = policy.penalty_percentage || 0;
        
        return {
          booking,
          canCancel: true,
          requiresPenalty: true,
          penaltyPercentage,
          message: `Cancellation within ${policy.minimum_hours_notice} hours incurs a ${penaltyPercentage}% penalty`
        };
      }
    }

    return {
      booking,
      canCancel: true,
      requiresPenalty: false,
      penaltyPercentage: 0
    };
  }
}