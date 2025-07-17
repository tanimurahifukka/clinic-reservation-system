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

    // Get booking ID from path parameters
    const bookingId = event.pathParameters?.id;
    if (!bookingId) {
      return createErrorResponse(400, 'Booking ID is required');
    }

    // Parse request body for cancellation reason
    let cancellationReason = 'User requested cancellation';
    if (event.body) {
      try {
        const requestBody = JSON.parse(event.body);
        if (requestBody.reason) {
          cancellationReason = requestBody.reason;
        }
      } catch (error) {
        // Ignore parsing error, use default reason
      }
    }

    // Cancel booking
    const cancelledBooking = await bookingService.cancelBooking(
      bookingId,
      cancellationReason,
      userId,
      userType
    );

    logger.info('Booking cancelled successfully', {
      bookingId,
      userId,
      userType,
      reason: cancellationReason,
      hadPenalty: false // Will be tracked separately in cancellation_fees table
    });

    return createResponse(200, {
      success: true,
      data: cancelledBooking,
      message: 'Booking cancelled successfully'
    });

  } catch (error: any) {
    logger.error('Cancel booking error', {
      error: error.message,
      stack: error.stack,
      event: {
        pathParameters: event.pathParameters,
        body: event.body,
        headers: event.headers,
        requestContext: event.requestContext
      }
    });

    // Handle specific errors
    if (error.message?.includes('not found')) {
      return createErrorResponse(404, 'Booking not found');
    }

    if (error.message?.includes('Unauthorized')) {
      return createErrorResponse(403, 'Unauthorized to cancel this booking');
    }

    if (error.message?.includes('Cannot cancel')) {
      return createErrorResponse(400, error.message);
    }

    return createErrorResponse(500, 'Failed to cancel booking', {
      requestId: event.requestContext.requestId
    });
  }
};