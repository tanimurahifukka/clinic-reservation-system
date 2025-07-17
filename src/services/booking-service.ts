import { v4 as uuidv4 } from 'uuid';
import { getAuroraClient } from '../utils/aurora-client';
import { getCacheClient } from '../utils/cache-client';
import { logger } from '../utils/logger';
import { BookingValidator, CreateBookingInput, UpdateBookingInput } from './booking-validator';
import { NotificationService } from './notification-service';

export interface Booking {
  id: string;
  patient_id: string;
  doctor_id: string;
  service_type_id: string;
  appointment_time: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  notes?: string;
  medical_record_number?: string;
  is_first_visit: boolean;
  symptoms?: string[];
  created_at: string;
  updated_at: string;
  cancellation_reason?: string;
  cancelled_at?: string;
  cancelled_by?: string;
  payment_method_id?: string;
  insurance_id?: string;
  total_amount?: number;
  insurance_covered_amount?: number;
  patient_payment_amount?: number;
}

export class BookingService {
  private auroraClient = getAuroraClient();
  private cacheClient = getCacheClient();
  private validator = new BookingValidator();
  private notificationService = new NotificationService();

  async createBooking(input: CreateBookingInput, userId: string): Promise<Booking> {
    // Validate input
    const validatedInput = await this.validator.validateCreateBooking(input);

    const bookingId = uuidv4();
    const now = new Date().toISOString();

    // Start transaction
    const transactionId = await this.auroraClient.beginTransaction();

    try {
      // Calculate pricing if service type has a price
      const pricingResult = await this.auroraClient.queryWithTransaction(
        `SELECT base_price, insurance_covered FROM service_types WHERE id = $1`,
        [validatedInput.serviceTypeId],
        transactionId
      );

      let totalAmount = 0;
      let insuranceCoveredAmount = 0;
      let patientPaymentAmount = 0;

      if (pricingResult.records.length > 0) {
        const service = pricingResult.records[0];
        totalAmount = service.base_price || 0;

        if (validatedInput.insuranceId && service.insurance_covered) {
          // Get insurance coverage percentage
          const insuranceResult = await this.auroraClient.queryWithTransaction(
            `SELECT coverage_percentage FROM patient_insurance WHERE id = $1`,
            [validatedInput.insuranceId],
            transactionId
          );

          if (insuranceResult.records.length > 0) {
            const coveragePercentage = insuranceResult.records[0].coverage_percentage || 70;
            insuranceCoveredAmount = (totalAmount * coveragePercentage) / 100;
            patientPaymentAmount = totalAmount - insuranceCoveredAmount;
          }
        } else {
          patientPaymentAmount = totalAmount;
        }
      }

      // Create booking
      const result = await this.auroraClient.queryWithTransaction(
        `INSERT INTO bookings (
          id, patient_id, doctor_id, service_type_id, appointment_time,
          status, notes, medical_record_number, is_first_visit, symptoms,
          payment_method_id, insurance_id, total_amount, insurance_covered_amount,
          patient_payment_amount, created_at, updated_at, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING *`,
        [
          bookingId,
          validatedInput.patientId,
          validatedInput.doctorId,
          validatedInput.serviceTypeId,
          validatedInput.appointmentTime,
          'pending',
          validatedInput.notes || null,
          validatedInput.medicalRecordNumber || null,
          validatedInput.isFirstVisit !== false,
          validatedInput.symptoms ? JSON.stringify(validatedInput.symptoms) : null,
          validatedInput.paymentMethodId || null,
          validatedInput.insuranceId || null,
          totalAmount,
          insuranceCoveredAmount,
          patientPaymentAmount,
          now,
          now,
          userId
        ],
        transactionId
      );

      // Generate QR code for the booking
      await this.auroraClient.queryWithTransaction(
        `INSERT INTO qr_codes (id, type, reference_id, created_at)
         VALUES ($1, $2, $3, $4)`,
        [uuidv4(), 'booking', bookingId, now],
        transactionId
      );

      // Update doctor's next available slot cache
      await this.updateDoctorAvailabilityCache(validatedInput.doctorId, transactionId);

      // Commit transaction
      await this.auroraClient.commitTransaction(transactionId);

      const booking = this.formatBooking(result.records[0]);

      // Send notifications asynchronously
      this.notificationService.sendBookingConfirmation(booking).catch(error => {
        logger.error('Failed to send booking notification', { error, bookingId });
      });

      // Invalidate related caches
      await Promise.all([
        this.cacheClient.del(`bookings:patient:${validatedInput.patientId}`),
        this.cacheClient.del(`bookings:doctor:${validatedInput.doctorId}`),
        this.cacheClient.del(`availability:${validatedInput.doctorId}:${validatedInput.appointmentTime.slice(0, 10)}`),
      ]).catch(error => {
        logger.error('Failed to invalidate cache', { error });
      });

      return booking;

    } catch (error) {
      await this.auroraClient.rollbackTransaction(transactionId);
      logger.error('Failed to create booking', { error, input });
      throw error;
    }
  }

  async getBooking(bookingId: string, userId: string, userType: 'patient' | 'doctor'): Promise<Booking | null> {
    // Try cache first
    const cacheKey = `booking:${bookingId}`;
    const cached = await this.cacheClient.get(cacheKey);
    
    if (cached) {
      const booking = JSON.parse(cached);
      // Verify user has access
      if (
        (userType === 'patient' && booking.patient_id === userId) ||
        (userType === 'doctor' && booking.doctor_id === userId)
      ) {
        return booking;
      }
      return null;
    }

    // Query database
    const result = await this.auroraClient.query(
      `SELECT b.*, 
        p.name as patient_name, p.email as patient_email, p.phone as patient_phone,
        d.name as doctor_name, d.specialization,
        st.name as service_name, st.duration_minutes,
        c.name as clinic_name
       FROM bookings b
       JOIN patients p ON b.patient_id = p.id
       JOIN doctors d ON b.doctor_id = d.id
       JOIN service_types st ON b.service_type_id = st.id
       JOIN clinics c ON d.clinic_id = c.id
       WHERE b.id = $1`,
      [bookingId]
    );

    if (result.records.length === 0) {
      return null;
    }

    const booking = this.formatBooking(result.records[0]);

    // Verify user has access
    if (userType === 'patient' && booking.patient_id !== userId) {
      return null;
    }
    
    if (userType === 'doctor' && booking.doctor_id !== userId) {
      return null;
    }

    // Cache for 5 minutes
    await this.cacheClient.setex(cacheKey, 300, JSON.stringify(booking));

    return booking;
  }

  async listBookings(
    userId: string,
    userType: 'patient' | 'doctor',
    filters?: {
      status?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ bookings: Booking[]; total: number }> {
    const limit = filters?.limit || 20;
    const offset = filters?.offset || 0;

    let query = `
      SELECT b.*, 
        p.name as patient_name, p.email as patient_email,
        d.name as doctor_name, d.specialization,
        st.name as service_name, st.duration_minutes,
        c.name as clinic_name
      FROM bookings b
      JOIN patients p ON b.patient_id = p.id
      JOIN doctors d ON b.doctor_id = d.id
      JOIN service_types st ON b.service_type_id = st.id
      JOIN clinics c ON d.clinic_id = c.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    // Add user filter
    if (userType === 'patient') {
      query += ` AND b.patient_id = $${paramIndex++}`;
      params.push(userId);
    } else {
      query += ` AND b.doctor_id = $${paramIndex++}`;
      params.push(userId);
    }

    // Add status filter
    if (filters?.status) {
      query += ` AND b.status = $${paramIndex++}`;
      params.push(filters.status);
    }

    // Add date filters
    if (filters?.startDate) {
      query += ` AND b.appointment_time >= $${paramIndex++}`;
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      query += ` AND b.appointment_time <= $${paramIndex++}`;
      params.push(filters.endDate);
    }

    // Get total count
    const countQuery = query.replace('SELECT b.*, p.name as patient_name, p.email as patient_email, d.name as doctor_name, d.specialization, st.name as service_name, st.duration_minutes, c.name as clinic_name', 'SELECT COUNT(*)');
    const countResult = await this.auroraClient.query(countQuery, params);
    const total = parseInt(countResult.records[0].count);

    // Add pagination
    query += ` ORDER BY b.appointment_time DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await this.auroraClient.query(query, params);

    const bookings = result.records.map(record => this.formatBooking(record));

    return { bookings, total };
  }

  async updateBooking(
    bookingId: string,
    input: UpdateBookingInput,
    userId: string,
    userType: 'patient' | 'doctor'
  ): Promise<Booking> {
    // Validate update
    const validatedInput = await this.validator.validateUpdateBooking(bookingId, input);

    // Get current booking to verify permissions
    const currentBooking = await this.getBooking(bookingId, userId, userType);
    if (!currentBooking) {
      throw new Error('Booking not found or unauthorized');
    }

    // Only allow updates to pending or confirmed bookings
    if (!['pending', 'confirmed'].includes(currentBooking.status)) {
      throw new Error('Cannot update booking with current status');
    }

    // Build update query
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (validatedInput.appointmentTime) {
      updates.push(`appointment_time = $${paramIndex++}`);
      params.push(validatedInput.appointmentTime);
    }

    if (validatedInput.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      params.push(validatedInput.notes);
    }

    if (validatedInput.serviceTypeId) {
      updates.push(`service_type_id = $${paramIndex++}`);
      params.push(validatedInput.serviceTypeId);
    }

    if (validatedInput.symptoms) {
      updates.push(`symptoms = $${paramIndex++}`);
      params.push(JSON.stringify(validatedInput.symptoms));
    }

    updates.push(`updated_at = $${paramIndex++}`);
    params.push(new Date().toISOString());

    updates.push(`updated_by = $${paramIndex++}`);
    params.push(userId);

    params.push(bookingId);

    const result = await this.auroraClient.query(
      `UPDATE bookings SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    const updatedBooking = this.formatBooking(result.records[0]);

    // Send update notification
    if (validatedInput.appointmentTime && validatedInput.appointmentTime !== currentBooking.appointment_time) {
      this.notificationService.sendBookingUpdate(updatedBooking, 'rescheduled').catch(error => {
        logger.error('Failed to send update notification', { error, bookingId });
      });
    }

    // Invalidate caches
    await Promise.all([
      this.cacheClient.del(`booking:${bookingId}`),
      this.cacheClient.del(`bookings:patient:${updatedBooking.patient_id}`),
      this.cacheClient.del(`bookings:doctor:${updatedBooking.doctor_id}`),
    ]).catch(error => {
      logger.error('Failed to invalidate cache', { error });
    });

    return updatedBooking;
  }

  async cancelBooking(
    bookingId: string,
    reason: string,
    userId: string,
    userType: 'patient' | 'doctor'
  ): Promise<Booking> {
    // Validate cancellation
    const validationResult = await this.validator.validateCancellation(bookingId, userId, userType);
    
    if (!validationResult.canCancel) {
      throw new Error('Cannot cancel this booking');
    }

    const now = new Date().toISOString();
    const transactionId = await this.auroraClient.beginTransaction();

    try {
      // Update booking status
      const result = await this.auroraClient.queryWithTransaction(
        `UPDATE bookings SET 
          status = 'cancelled',
          cancellation_reason = $1,
          cancelled_at = $2,
          cancelled_by = $3,
          updated_at = $2
         WHERE id = $4
         RETURNING *`,
        [reason, now, userId, bookingId],
        transactionId
      );

      // Handle cancellation penalty if required
      if (validationResult.requiresPenalty && validationResult.penaltyPercentage > 0) {
        const booking = result.records[0];
        const penaltyAmount = (booking.patient_payment_amount * validationResult.penaltyPercentage) / 100;

        await this.auroraClient.queryWithTransaction(
          `INSERT INTO cancellation_fees (
            id, booking_id, amount, percentage, created_at
          ) VALUES ($1, $2, $3, $4, $5)`,
          [uuidv4(), bookingId, penaltyAmount, validationResult.penaltyPercentage, now],
          transactionId
        );
      }

      await this.auroraClient.commitTransaction(transactionId);

      const cancelledBooking = this.formatBooking(result.records[0]);

      // Send cancellation notification
      this.notificationService.sendBookingCancellation(cancelledBooking, reason).catch(error => {
        logger.error('Failed to send cancellation notification', { error, bookingId });
      });

      // Invalidate caches
      await Promise.all([
        this.cacheClient.del(`booking:${bookingId}`),
        this.cacheClient.del(`bookings:patient:${cancelledBooking.patient_id}`),
        this.cacheClient.del(`bookings:doctor:${cancelledBooking.doctor_id}`),
      ]).catch(error => {
        logger.error('Failed to invalidate cache', { error });
      });

      return cancelledBooking;

    } catch (error) {
      await this.auroraClient.rollbackTransaction(transactionId);
      throw error;
    }
  }

  private formatBooking(record: any): Booking {
    return {
      id: record.id,
      patient_id: record.patient_id,
      doctor_id: record.doctor_id,
      service_type_id: record.service_type_id,
      appointment_time: record.appointment_time,
      status: record.status,
      notes: record.notes,
      medical_record_number: record.medical_record_number,
      is_first_visit: record.is_first_visit,
      symptoms: record.symptoms ? JSON.parse(record.symptoms) : undefined,
      created_at: record.created_at,
      updated_at: record.updated_at,
      cancellation_reason: record.cancellation_reason,
      cancelled_at: record.cancelled_at,
      cancelled_by: record.cancelled_by,
      payment_method_id: record.payment_method_id,
      insurance_id: record.insurance_id,
      total_amount: record.total_amount,
      insurance_covered_amount: record.insurance_covered_amount,
      patient_payment_amount: record.patient_payment_amount,
      // Additional fields from joins
      ...(record.patient_name && {
        patient_name: record.patient_name,
        patient_email: record.patient_email,
        patient_phone: record.patient_phone,
      }),
      ...(record.doctor_name && {
        doctor_name: record.doctor_name,
        doctor_specialization: record.specialization,
      }),
      ...(record.service_name && {
        service_name: record.service_name,
        service_duration: record.duration_minutes,
      }),
      ...(record.clinic_name && {
        clinic_name: record.clinic_name,
      }),
    };
  }

  private async updateDoctorAvailabilityCache(doctorId: string, transactionId: string): Promise<void> {
    try {
      // Get next available slots
      const result = await this.auroraClient.queryWithTransaction(
        `SELECT ds.day_of_week, ds.start_time, ds.end_time, ds.slot_duration_minutes
         FROM doctor_schedules ds
         WHERE ds.doctor_id = $1 AND ds.is_active = true
         ORDER BY ds.day_of_week, ds.start_time`,
        [doctorId],
        transactionId
      );

      if (result.records.length > 0) {
        // Cache doctor's schedule for quick availability checks
        const cacheKey = `doctor:schedule:${doctorId}`;
        await this.cacheClient.setex(cacheKey, 3600, JSON.stringify(result.records));
      }
    } catch (error) {
      logger.error('Failed to update doctor availability cache', { error, doctorId });
    }
  }
}