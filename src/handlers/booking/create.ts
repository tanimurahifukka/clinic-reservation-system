import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { BookingService } from '../../services/booking-service';
import { createResponse, createErrorResponse } from '../../utils/response';
import { logger } from '../../utils/logger';
import { createRateLimitMiddleware } from '../../middleware/rate-limiter';

const bookingService = new BookingService();
const rateLimiter = createRateLimitMiddleware({ maxRequests: 5, windowMs: 60000 }); // 5 requests per minute per user

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Apply rate limiting
    const rateLimitResult = await rateLimiter(event);
    if (rateLimitResult) {
      return rateLimitResult;
    }

    // Get user info from authorizer context
    const userId = event.requestContext.authorizer?.userId;
    const userType = event.requestContext.authorizer?.userType || 'patient';

    if (!userId) {
      return createErrorResponse(401, 'Unauthorized');
    }

    // Parse request body
    if (!event.body) {
      return createErrorResponse(400, 'Request body is required');
    }

    let requestBody;
    try {
      requestBody = JSON.parse(event.body);
    } catch (error) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }

    // For patients, enforce that they can only book for themselves
    if (userType === 'patient') {
      requestBody.patientId = userId;
    }

    // Set preferred language from headers if not provided
    if (!requestBody.preferredLanguage) {
      requestBody.preferredLanguage = event.headers['Accept-Language']?.split(',')[0]?.slice(0, 2) || 'ja';
    }

    // Create booking
    const booking = await bookingService.createBooking(requestBody, userId);

    logger.info('Booking created successfully', { 
      bookingId: booking.id,
      userId,
      userType
    });

    return createResponse(201, {
      success: true,
      data: booking,
      message: 'Booking created successfully'
    });

  } catch (error: any) {
    logger.error('Create booking error', { 
      error: error.message,
      stack: error.stack,
      event: {
        body: event.body,
        headers: event.headers,
        requestContext: event.requestContext
      }
    });

    // Handle validation errors
    if (error.message?.includes('Validation error:') || 
        error.message?.includes('not found') ||
        error.message?.includes('not active') ||
        error.message?.includes('already booked') ||
        error.message?.includes('not available')) {
      return createErrorResponse(400, error.message);
    }

    // Handle authorization errors
    if (error.message?.includes('Unauthorized')) {
      return createErrorResponse(403, error.message);
    }

    // Generic error response
    return createErrorResponse(500, 'Failed to create booking', {
      requestId: event.requestContext.requestId
    });
  }
};