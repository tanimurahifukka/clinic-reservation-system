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

    // Update booking
    const updatedBooking = await bookingService.updateBooking(
      bookingId,
      requestBody,
      userId,
      userType
    );

    logger.info('Booking updated successfully', {
      bookingId,
      userId,
      userType,
      updates: Object.keys(requestBody)
    });

    return createResponse(200, {
      success: true,
      data: updatedBooking,
      message: 'Booking updated successfully'
    });

  } catch (error: any) {
    logger.error('Update booking error', {
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
    if (error.message?.includes('not found') || error.message?.includes('unauthorized')) {
      return createErrorResponse(404, 'Booking not found or unauthorized');
    }

    if (error.message?.includes('Cannot update')) {
      return createErrorResponse(400, error.message);
    }

    if (error.message?.includes('Validation error:')) {
      return createErrorResponse(400, error.message);
    }

    return createErrorResponse(500, 'Failed to update booking', {
      requestId: event.requestContext.requestId
    });
  }
};