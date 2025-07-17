import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getAuroraClient } from '../../utils/aurora-client';
import { createResponse, createErrorResponse } from '../../utils/response';
import { logger } from '../../utils/logger';

const auroraClient = getAuroraClient();

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Get user info from authorizer context
    const userId = event.requestContext.authorizer?.userId;
    const userType = event.requestContext.authorizer?.userType;

    if (!userId) {
      return createErrorResponse(401, 'Unauthorized');
    }

    // Get patient ID from path or use authenticated user's ID
    let patientId = event.pathParameters?.patientId;
    
    if (!patientId) {
      // If no patient ID in path, get the patient ID for the authenticated user
      if (userType === 'patient') {
        const patientResult = await auroraClient.query(
          'SELECT id FROM patients WHERE user_id = $1',
          [userId]
        );
        
        if (patientResult.records.length === 0) {
          return createErrorResponse(404, 'Patient profile not found');
        }
        
        patientId = patientResult.records[0].id;
      } else {
        return createErrorResponse(400, 'Patient ID is required');
      }
    } else {
      // If patient ID is provided, verify access
      if (userType === 'patient') {
        // Patients can only view their own profile
        const patientResult = await auroraClient.query(
          'SELECT id FROM patients WHERE id = $1 AND user_id = $2',
          [patientId, userId]
        );
        
        if (patientResult.records.length === 0) {
          return createErrorResponse(403, 'Access denied');
        }
      }
      // Doctors and staff can view any patient profile
    }

    // Get patient profile with related data
    const profileResult = await auroraClient.query(
      `SELECT 
        p.*,
        u.email, u.name, u.phone_number, u.profile_image_url,
        u.email_verified, u.last_login_at,
        COUNT(DISTINCT b.id) as total_bookings,
        COUNT(DISTINCT CASE WHEN b.status = 'completed' THEN b.id END) as completed_bookings,
        MAX(b.appointment_time) as last_appointment
       FROM patients p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN bookings b ON p.id = b.patient_id
       WHERE p.id = $1
       GROUP BY p.id, u.id`,
      [patientId]
    );

    if (profileResult.records.length === 0) {
      return createErrorResponse(404, 'Patient not found');
    }

    const patient = profileResult.records[0];

    // Get medical history
    const medicalHistoryResult = await auroraClient.query(
      `SELECT * FROM medical_histories 
       WHERE patient_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [patientId]
    );

    // Get active insurance
    const insuranceResult = await auroraClient.query(
      `SELECT * FROM patient_insurance 
       WHERE patient_id = $1 AND is_active = true 
       ORDER BY created_at DESC`,
      [patientId]
    );

    // Get recent appointments
    const appointmentsResult = await auroraClient.query(
      `SELECT 
        b.id, b.appointment_time, b.status,
        d.name as doctor_name, d.specialization,
        st.name as service_name,
        c.name as clinic_name
       FROM bookings b
       JOIN doctors d ON b.doctor_id = d.id
       JOIN service_types st ON b.service_type_id = st.id
       JOIN clinics c ON d.clinic_id = c.id
       WHERE b.patient_id = $1
       ORDER BY b.appointment_time DESC
       LIMIT 5`,
      [patientId]
    );

    // Format response
    const profile = {
      id: patient.id,
      userId: patient.user_id,
      email: patient.email,
      name: patient.name,
      phoneNumber: patient.phone_number,
      profileImage: patient.profile_image_url,
      emailVerified: patient.email_verified,
      dateOfBirth: patient.date_of_birth,
      gender: patient.gender,
      bloodType: patient.blood_type,
      medicalRecordNumber: patient.medical_record_number,
      address: JSON.parse(patient.address || '{}'),
      emergencyContact: patient.emergency_contact_name ? {
        name: patient.emergency_contact_name,
        phone: patient.emergency_contact_phone,
        relationship: patient.emergency_contact_relationship
      } : null,
      preferredLanguage: patient.preferred_language,
      marketingConsent: patient.marketing_consent,
      statistics: {
        totalBookings: parseInt(patient.total_bookings),
        completedBookings: parseInt(patient.completed_bookings),
        lastAppointment: patient.last_appointment
      },
      medicalHistory: medicalHistoryResult.records.length > 0 ? {
        allergies: JSON.parse(medicalHistoryResult.records[0].allergies || '[]'),
        chronicConditions: JSON.parse(medicalHistoryResult.records[0].chronic_conditions || '[]'),
        currentMedications: JSON.parse(medicalHistoryResult.records[0].current_medications || '[]'),
        lastUpdated: medicalHistoryResult.records[0].updated_at
      } : null,
      insurance: insuranceResult.records.map(ins => ({
        id: ins.id,
        provider: ins.provider,
        policyNumber: ins.policy_number,
        groupNumber: ins.group_number,
        expiryDate: ins.expiry_date,
        coveragePercentage: ins.coverage_percentage,
        isActive: ins.is_active
      })),
      recentAppointments: appointmentsResult.records.map(apt => ({
        id: apt.id,
        appointmentTime: apt.appointment_time,
        status: apt.status,
        doctorName: apt.doctor_name,
        specialization: apt.specialization,
        serviceName: apt.service_name,
        clinicName: apt.clinic_name
      })),
      createdAt: patient.created_at,
      updatedAt: patient.updated_at
    };

    logger.info('Patient profile retrieved', {
      patientId,
      userId,
      userType
    });

    return createResponse(200, {
      success: true,
      data: profile
    });

  } catch (error: any) {
    logger.error('Get patient profile error', {
      error: error.message,
      stack: error.stack,
      event: {
        pathParameters: event.pathParameters,
        requestContext: event.requestContext
      }
    });

    return createErrorResponse(500, 'Failed to retrieve patient profile', {
      requestId: event.requestContext.requestId
    });
  }
};