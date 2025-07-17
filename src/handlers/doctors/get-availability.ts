import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DoctorAvailabilityService } from '../../services/doctor-availability-service';
import { createResponse, createErrorResponse } from '../../utils/response';
import { logger } from '../../utils/logger';

const availabilityService = new DoctorAvailabilityService();

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Get doctor ID from path parameters
    const doctorId = event.pathParameters?.doctorId;
    if (!doctorId) {
      return createErrorResponse(400, 'Doctor ID is required');
    }

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const date = queryParams.date;
    const startDate = queryParams.startDate;
    const endDate = queryParams.endDate;
    const serviceTypeId = queryParams.serviceTypeId;
    const timezone = queryParams.timezone || 'Asia/Tokyo';

    // Validate timezone
    const validTimezones = ['Asia/Tokyo', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Taipei'];
    if (!validTimezones.includes(timezone)) {
      return createErrorResponse(400, 'Invalid timezone');
    }

    let result;

    if (date) {
      // Single date availability
      if (!isValidDate(date)) {
        return createErrorResponse(400, 'Invalid date format. Use YYYY-MM-DD');
      }

      result = await availabilityService.getDoctorAvailability(
        doctorId,
        date,
        serviceTypeId,
        timezone
      );

    } else if (startDate && endDate) {
      // Date range availability
      if (!isValidDate(startDate) || !isValidDate(endDate)) {
        return createErrorResponse(400, 'Invalid date format. Use YYYY-MM-DD');
      }

      if (startDate > endDate) {
        return createErrorResponse(400, 'Start date must be before end date');
      }

      result = await availabilityService.getDoctorAvailabilityRange(
        doctorId,
        startDate,
        endDate,
        serviceTypeId,
        timezone
      );

    } else {
      // Next available slot
      const nextSlot = await availabilityService.getNextAvailableSlot(
        doctorId,
        serviceTypeId,
        timezone
      );

      result = {
        doctorId,
        nextAvailableSlot: nextSlot,
        timezone
      };
    }

    logger.info('Doctor availability retrieved', {
      doctorId,
      date,
      startDate,
      endDate,
      serviceTypeId,
      timezone
    });

    return createResponse(200, {
      success: true,
      data: result
    });

  } catch (error: any) {
    logger.error('Get doctor availability error', {
      error: error.message,
      stack: error.stack,
      event: {
        pathParameters: event.pathParameters,
        queryStringParameters: event.queryStringParameters,
      }
    });

    if (error.message?.includes('exceed 30 days')) {
      return createErrorResponse(400, error.message);
    }

    return createErrorResponse(500, 'Failed to retrieve doctor availability', {
      requestId: event.requestContext.requestId
    });
  }
};

function isValidDate(dateString: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) {
    return false;
  }
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}