import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createResponse } from '../utils/response';
import { logger } from '../utils/logger';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    logger.info('Health check requested', { 
      requestId: event.requestContext.requestId 
    });

    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: process.env.SERVICE_NAME || 'clinic-reservation-system',
      stage: process.env.STAGE || 'dev',
      region: process.env.REGION || 'ap-northeast-1',
      version: '1.0.0'
    };

    return createResponse(200, healthStatus);
  } catch (error) {
    logger.error('Health check failed', { error });
    
    return createResponse(500, {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Internal server error'
    });
  }
};