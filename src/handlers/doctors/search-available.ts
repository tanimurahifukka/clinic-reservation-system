import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DoctorAvailabilityService } from '../../services/doctor-availability-service';
import { createResponse, createErrorResponse } from '../../utils/response';
import { logger } from '../../utils/logger';

const availabilityService = new DoctorAvailabilityService();

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const clinicId = queryParams.clinicId;
    const date = queryParams.date;
    const serviceTypeId = queryParams.serviceTypeId;
    const preferredTime = queryParams.preferredTime;
    const timezone = queryParams.timezone || 'Asia/Tokyo';

    // Validate required parameters
    if (!clinicId || !date) {
      return createErrorResponse(400, 'clinicId and date are required');
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return createErrorResponse(400, 'Invalid date format. Use YYYY-MM-DD');
    }

    // Validate timezone
    const validTimezones = ['Asia/Tokyo', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Taipei'];
    if (!validTimezones.includes(timezone)) {
      return createErrorResponse(400, 'Invalid timezone');
    }

    // Validate preferred time if provided
    if (preferredTime) {
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (!timeRegex.test(preferredTime)) {
        return createErrorResponse(400, 'Invalid time format. Use HH:MM');
      }
    }

    // Search for available doctors
    const availableDoctors = await availabilityService.searchAvailableDoctors(
      clinicId,
      date,
      serviceTypeId,
      preferredTime,
      timezone
    );

    logger.info('Available doctors searched', {
      clinicId,
      date,
      serviceTypeId,
      preferredTime,
      timezone,
      foundCount: availableDoctors.length
    });

    return createResponse(200, {
      success: true,
      data: {
        clinicId,
        date,
        serviceTypeId,
        timezone,
        totalFound: availableDoctors.length,
        doctors: availableDoctors
      }
    });

  } catch (error: any) {
    logger.error('Search available doctors error', {
      error: error.message,
      stack: error.stack,
      event: {
        queryStringParameters: event.queryStringParameters,
      }
    });

    return createErrorResponse(500, 'Failed to search available doctors', {
      requestId: event.requestContext.requestId
    });
  }
};