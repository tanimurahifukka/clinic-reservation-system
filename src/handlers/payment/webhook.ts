import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PaymentService } from '../../services/payment-service';
import { createResponse, createErrorResponse } from '../../utils/response';
import { logger } from '../../utils/logger';

const paymentService = new PaymentService();

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Stripe webhooks require the raw body
    if (!event.body) {
      return createErrorResponse(400, 'Request body is required');
    }

    // Log webhook event
    logger.info('Stripe webhook received', {
      headers: event.headers,
      requestId: event.requestContext.requestId,
    });

    // Process webhook
    await paymentService.handleStripeWebhook(event);

    // Return success immediately to acknowledge receipt
    return createResponse(200, {
      received: true,
    });

  } catch (error: any) {
    logger.error('Webhook processing error', {
      error: error.message,
      stack: error.stack,
      event: {
        headers: event.headers,
        requestContext: event.requestContext,
      }
    });

    // For webhook endpoints, we should still return 200 to prevent retries
    // unless it's a signature verification error
    if (error.message?.includes('signature')) {
      return createErrorResponse(400, 'Invalid signature');
    }

    // Log the error but return success to prevent Stripe retries
    return createResponse(200, {
      received: true,
      error: 'Processing failed but acknowledged',
    });
  }
};