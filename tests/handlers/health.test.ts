import { handler } from '../../src/handlers/health';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

describe('Health Handler', () => {
  let mockEvent: APIGatewayProxyEvent;
  let mockContext: Context;

  beforeEach(() => {
    mockEvent = global.mockAPIGatewayEvent();
    mockContext = global.mockContext();
  });

  it('should return health status successfully', async () => {
    const result = await handler(mockEvent, mockContext, () => {});

    expect(result.statusCode).toBe(200);
    
    const body = JSON.parse(result.body);
    expect(body).toMatchObject({
      status: 'healthy',
      service: 'clinic-reservation-system',
      stage: 'test',
      region: 'ap-northeast-1',
      version: '1.0.0'
    });
    
    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp)).toBeInstanceOf(Date);
  });

  it('should include correct CORS headers', async () => {
    const result = await handler(mockEvent, mockContext, () => {});

    expect(result.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    });
  });

  it('should handle errors gracefully', async () => {
    // Mock console.error to avoid noise in test output
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Force an error by mocking JSON.stringify to throw
    const originalStringify = JSON.stringify;
    JSON.stringify = jest.fn().mockImplementation(() => {
      throw new Error('JSON stringify error');
    });

    const result = await handler(mockEvent, mockContext, () => {});

    expect(result.statusCode).toBe(500);
    
    // Restore original functions
    JSON.stringify = originalStringify;
    consoleSpy.mockRestore();
  });
});