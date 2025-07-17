import { APIGatewayProxyResult } from 'aws-lambda';

export const createResponse = (
  statusCode: number,
  body: any,
  headers: Record<string, string> = {}
): APIGatewayProxyResult => {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      ...headers
    },
    body: JSON.stringify(body)
  };
};

export const createErrorResponse = (
  statusCode: number,
  message: string,
  details?: any
): APIGatewayProxyResult => {
  return createResponse(statusCode, {
    error: message,
    ...(details && { details })
  });
};

// Alias for backward compatibility
export const errorResponse = createErrorResponse;