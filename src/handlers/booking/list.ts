import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { BookingService } from '../../services/booking-service';
import { createResponse, createErrorResponse } from '../../utils/response';
import { logger } from '../../utils/logger';

const bookingService = new BookingService();

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Get user info from authorizer context
    const userId = event.requestContext.authorizer?.userId;
    const userType = event.requestContext.authorizer?.userType || 'patient';

    if (!userId) {
      return createErrorResponse(401, 'Unauthorized');
    }

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const filters = {
      status: queryParams.status,
      startDate: queryParams.startDate,
      endDate: queryParams.endDate,
      limit: queryParams.limit ? parseInt(queryParams.limit) : 20,
      offset: queryParams.offset ? parseInt(queryParams.offset) : 0,
    };

    // Validate pagination parameters
    if (filters.limit < 1 || filters.limit > 100) {
      return createErrorResponse(400, 'Limit must be between 1 and 100');
    }

    if (filters.offset < 0) {
      return createErrorResponse(400, 'Offset must be non-negative');
    }

    // Validate date formats if provided
    if (filters.startDate && isNaN(Date.parse(filters.startDate))) {
      return createErrorResponse(400, 'Invalid startDate format');
    }

    if (filters.endDate && isNaN(Date.parse(filters.endDate))) {
      return createErrorResponse(400, 'Invalid endDate format');
    }

    // Validate status if provided
    const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'];
    if (filters.status && !validStatuses.includes(filters.status)) {
      return createErrorResponse(400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    // Get bookings
    const result = await bookingService.listBookings(userId, userType, filters);

    logger.info('Bookings retrieved successfully', {
      userId,
      userType,
      count: result.bookings.length,
      total: result.total,
      filters
    });

    return createResponse(200, {
      success: true,
      data: {
        bookings: result.bookings,
        pagination: {
          total: result.total,
          limit: filters.limit,
          offset: filters.offset,
          hasMore: filters.offset + filters.limit < result.total
        }
      }
    });

  } catch (error: any) {
    logger.error('List bookings error', {
      error: error.message,
      stack: error.stack,
      event: {
        queryStringParameters: event.queryStringParameters,
        headers: event.headers,
        requestContext: event.requestContext
      }
    });

    return createErrorResponse(500, 'Failed to retrieve bookings', {
      requestId: event.requestContext.requestId
    });
  }
};