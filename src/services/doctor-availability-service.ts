import { getAuroraClient } from '../utils/aurora-client';
import { getCacheClient } from '../utils/cache-client';
import { logger } from '../utils/logger';
import moment from 'moment-timezone';

export interface TimeSlot {
  time: string;
  available: boolean;
  doctorId: string;
  serviceTypeId?: string;
}

export interface DoctorSchedule {
  id: string;
  doctor_id: string;
  clinic_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  service_type_id?: string;
  is_active: boolean;
}

export interface DoctorAvailability {
  doctorId: string;
  date: string;
  timeSlots: TimeSlot[];
  timezone: string;
}

export class DoctorAvailabilityService {
  private auroraClient = getAuroraClient();
  private cacheClient = getCacheClient();
  private defaultTimezone = 'Asia/Tokyo';

  async getDoctorAvailability(
    doctorId: string,
    date: string,
    serviceTypeId?: string,
    timezone: string = this.defaultTimezone
  ): Promise<DoctorAvailability> {
    // Check cache first
    const cacheKey = `availability:${doctorId}:${date}:${serviceTypeId || 'all'}`;
    const cached = await this.cacheClient.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    // Get doctor's schedule for the given day
    const dayOfWeek = moment.tz(date, timezone).day();
    const schedules = await this.getDoctorSchedules(doctorId, dayOfWeek, serviceTypeId);

    if (schedules.length === 0) {
      return {
        doctorId,
        date,
        timeSlots: [],
        timezone
      };
    }

    // Get existing bookings for the date
    const bookings = await this.getBookingsForDate(doctorId, date);

    // Generate time slots
    const timeSlots = this.generateTimeSlots(schedules, bookings, date, timezone);

    const availability: DoctorAvailability = {
      doctorId,
      date,
      timeSlots,
      timezone
    };

    // Cache for 5 minutes
    await this.cacheClient.set(cacheKey, JSON.stringify(availability), 300);

    return availability;
  }

  async getDoctorAvailabilityRange(
    doctorId: string,
    startDate: string,
    endDate: string,
    serviceTypeId?: string,
    timezone: string = this.defaultTimezone
  ): Promise<DoctorAvailability[]> {
    const availabilities: DoctorAvailability[] = [];
    const start = moment.tz(startDate, timezone);
    const end = moment.tz(endDate, timezone);

    // Limit to 30 days to prevent abuse
    const daysDiff = end.diff(start, 'days');
    if (daysDiff > 30) {
      throw new Error('Date range cannot exceed 30 days');
    }

    // Get availability for each day
    const current = start.clone();
    while (current.isSameOrBefore(end)) {
      const availability = await this.getDoctorAvailability(
        doctorId,
        current.format('YYYY-MM-DD'),
        serviceTypeId,
        timezone
      );
      availabilities.push(availability);
      current.add(1, 'day');
    }

    return availabilities;
  }

  async getNextAvailableSlot(
    doctorId: string,
    serviceTypeId?: string,
    timezone: string = this.defaultTimezone
  ): Promise<TimeSlot | null> {
    const maxDaysToCheck = 30;
    const startDate = moment.tz(timezone);

    for (let i = 0; i < maxDaysToCheck; i++) {
      const checkDate = startDate.clone().add(i, 'days').format('YYYY-MM-DD');
      const availability = await this.getDoctorAvailability(
        doctorId,
        checkDate,
        serviceTypeId,
        timezone
      );

      const availableSlot = availability.timeSlots.find(slot => slot.available);
      if (availableSlot) {
        return availableSlot;
      }
    }

    return null;
  }

  async searchAvailableDoctors(
    clinicId: string,
    date: string,
    serviceTypeId?: string,
    preferredTime?: string,
    timezone: string = this.defaultTimezone
  ): Promise<Array<{ doctor: any; availableSlots: TimeSlot[] }>> {
    // Get all active doctors in the clinic
    const doctorsResult = await this.auroraClient.query(
      `SELECT d.*, u.name, u.email, u.profile_image_url
       FROM doctors d
       JOIN users u ON d.user_id = u.id
       WHERE d.clinic_id = $1 AND d.is_active = true`,
      [clinicId]
    );

    const availableDoctors = [];

    for (const doctor of doctorsResult.records) {
      const availability = await this.getDoctorAvailability(
        doctor.id,
        date,
        serviceTypeId,
        timezone
      );

      const availableSlots = availability.timeSlots.filter(slot => {
        if (!slot.available) return false;
        if (preferredTime) {
          const slotTime = moment(slot.time, 'HH:mm');
          const preferred = moment(preferredTime, 'HH:mm');
          const diffMinutes = Math.abs(slotTime.diff(preferred, 'minutes'));
          return diffMinutes <= 60; // Within 1 hour of preferred time
        }
        return true;
      });

      if (availableSlots.length > 0) {
        availableDoctors.push({
          doctor: {
            id: doctor.id,
            name: doctor.name,
            specialization: doctor.specialization,
            profileImage: doctor.profile_image_url,
            rating: doctor.average_rating,
          },
          availableSlots
        });
      }
    }

    // Sort by number of available slots (more availability first)
    availableDoctors.sort((a, b) => b.availableSlots.length - a.availableSlots.length);

    return availableDoctors;
  }

  private async getDoctorSchedules(
    doctorId: string,
    dayOfWeek: number,
    serviceTypeId?: string
  ): Promise<DoctorSchedule[]> {
    let query = `
      SELECT * FROM doctor_schedules
      WHERE doctor_id = $1 AND day_of_week = $2 AND is_active = true
    `;
    const params = [doctorId, dayOfWeek];

    if (serviceTypeId) {
      query += ' AND (service_type_id = $3 OR service_type_id IS NULL)';
      params.push(serviceTypeId);
    }

    query += ' ORDER BY start_time';

    const result = await this.auroraClient.query(query, params);
    return result.records;
  }

  private async getBookingsForDate(doctorId: string, date: string): Promise<any[]> {
    const startOfDay = `${date} 00:00:00`;
    const endOfDay = `${date} 23:59:59`;

    const result = await this.auroraClient.query(
      `SELECT appointment_time, service_type_id
       FROM bookings
       WHERE doctor_id = $1
       AND appointment_time >= $2
       AND appointment_time <= $3
       AND status IN ('pending', 'confirmed')`,
      [doctorId, startOfDay, endOfDay]
    );

    return result.records;
  }

  private generateTimeSlots(
    schedules: DoctorSchedule[],
    bookings: any[],
    date: string,
    timezone: string
  ): TimeSlot[] {
    const timeSlots: TimeSlot[] = [];
    const bookedTimes = new Set(
      bookings.map(booking => 
        moment.tz(booking.appointment_time, timezone).format('HH:mm')
      )
    );

    const now = moment.tz(timezone);
    const slotDate = moment.tz(date, timezone);
    const isToday = slotDate.isSame(now, 'day');

    for (const schedule of schedules) {
      const startTime = moment(schedule.start_time, 'HH:mm');
      const endTime = moment(schedule.end_time, 'HH:mm');
      const slotDuration = schedule.slot_duration_minutes;

      let currentSlot = startTime.clone();

      while (currentSlot.isBefore(endTime)) {
        const slotTimeString = currentSlot.format('HH:mm');
        
        // Check if slot is available
        let available = !bookedTimes.has(slotTimeString);

        // If it's today, check if the slot time has passed
        if (isToday && available) {
          const slotDateTime = slotDate.clone()
            .hour(currentSlot.hour())
            .minute(currentSlot.minute());
          
          // Require at least 1 hour advance notice
          available = slotDateTime.isAfter(now.clone().add(1, 'hour'));
        }

        timeSlots.push({
          time: slotTimeString,
          available,
          doctorId: schedule.doctor_id,
          serviceTypeId: schedule.service_type_id
        });

        currentSlot.add(slotDuration, 'minutes');
      }
    }

    // Sort by time
    timeSlots.sort((a, b) => a.time.localeCompare(b.time));

    return timeSlots;
  }

  async updateDoctorSchedule(
    doctorId: string,
    schedules: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      slotDurationMinutes: number;
      serviceTypeId?: string;
    }>
  ): Promise<void> {
    const transactionId = await this.auroraClient.beginTransaction();

    try {
      // Deactivate all existing schedules
      await this.auroraClient.queryWithTransaction(
        'UPDATE doctor_schedules SET is_active = false WHERE doctor_id = $1',
        [doctorId],
        transactionId
      );

      // Insert new schedules
      for (const schedule of schedules) {
        await this.auroraClient.queryWithTransaction(
          `INSERT INTO doctor_schedules (
            id, doctor_id, clinic_id, day_of_week, start_time, end_time,
            slot_duration_minutes, service_type_id, is_active, created_at
          ) VALUES (
            uuid_generate_v4(), $1, 
            (SELECT clinic_id FROM doctors WHERE id = $1),
            $2, $3, $4, $5, $6, true, NOW()
          )`,
          [
            doctorId,
            schedule.dayOfWeek,
            schedule.startTime,
            schedule.endTime,
            schedule.slotDurationMinutes,
            schedule.serviceTypeId || null
          ],
          transactionId
        );
      }

      await this.auroraClient.commitTransaction(transactionId);

      // Clear cache
      const cachePattern = `availability:${doctorId}:*`;
      // Note: In production, you'd need to implement pattern-based cache clearing
      logger.info('Doctor schedule updated', { doctorId, scheduleCount: schedules.length });

    } catch (error) {
      await this.auroraClient.rollbackTransaction(transactionId);
      logger.error('Failed to update doctor schedule', { error, doctorId });
      throw error;
    }
  }

  async blockTimeSlots(
    doctorId: string,
    dates: string[],
    timeSlots: string[],
    reason: string = 'Doctor unavailable'
  ): Promise<void> {
    const blockedSlots = [];

    for (const date of dates) {
      for (const time of timeSlots) {
        const appointmentTime = `${date} ${time}:00`;
        blockedSlots.push([
          doctorId,
          appointmentTime,
          reason,
          new Date().toISOString()
        ]);
      }
    }

    if (blockedSlots.length > 0) {
      await this.auroraClient.batchQuery(
        `INSERT INTO blocked_slots (doctor_id, blocked_time, reason, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (doctor_id, blocked_time) DO UPDATE SET reason = $3`,
        blockedSlots
      );

      // Clear cache for affected dates
      for (const date of dates) {
        const cacheKey = `availability:${doctorId}:${date}:*`;
        // Clear cache pattern
      }
    }
  }

  async unblockTimeSlots(
    doctorId: string,
    dates: string[],
    timeSlots: string[]
  ): Promise<void> {
    const unblockedSlots = [];

    for (const date of dates) {
      for (const time of timeSlots) {
        const appointmentTime = `${date} ${time}:00`;
        unblockedSlots.push([doctorId, appointmentTime]);
      }
    }

    if (unblockedSlots.length > 0) {
      for (const [doctorId, appointmentTime] of unblockedSlots) {
        await this.auroraClient.query(
          'DELETE FROM blocked_slots WHERE doctor_id = $1 AND blocked_time = $2',
          [doctorId, appointmentTime]
        );
      }

      // Clear cache for affected dates
      for (const date of dates) {
        const cacheKey = `availability:${doctorId}:${date}:*`;
        // Clear cache pattern
      }
    }
  }
}