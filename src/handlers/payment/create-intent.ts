import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PaymentService } from '../../services/payment-service';
import { createResponse, createErrorResponse } from '../../utils/response';
import { logger } from '../../utils/logger';

const paymentService = new PaymentService();

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Get user info from authorizer context
    const userId = event.requestContext.authorizer?.userId;
    const userType = event.requestContext.authorizer?.userType || 'patient';

    if (!userId || userType !== 'patient') {
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

    // Validate required fields
    if (!requestBody.bookingId || !requestBody.amount) {
      return createErrorResponse(400, 'bookingId and amount are required');
    }

    // Create payment intent
    const paymentIntent = await paymentService.createPaymentIntent(
      requestBody.bookingId,
      requestBody.amount,
      requestBody.currency || 'jpy',
      requestBody.paymentMethodId
    );

    logger.info('Payment intent created', {
      paymentIntentId: paymentIntent.id,
      bookingId: requestBody.bookingId,
      amount: requestBody.amount,
      userId,
    });

    return createResponse(200, {
      success: true,
      data: {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.stripe_client_secret,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
      }
    });

  } catch (error: any) {
    logger.error('Create payment intent error', {
      error: error.message,
      stack: error.stack,
      event: {
        body: event.body,
        headers: event.headers,
        requestContext: event.requestContext,
      }
    });

    if (error.message?.includes('not found')) {
      return createErrorResponse(404, error.message);
    }

    return createErrorResponse(500, 'Failed to create payment intent', {
      requestId: event.requestContext.requestId
    });
  }
};