// Test setup file
// This file runs before each test suite

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.STAGE = 'test';
process.env.REGION = 'ap-northeast-1';
process.env.SERVICE_NAME = 'clinic-reservation-system';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

// Mock AWS SDK
jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
  SSM: jest.fn(() => ({
    getParameter: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Parameter: { Value: 'mock-value' }
      })
    }),
    getParameters: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Parameters: []
      })
    })
  })),
  SecretsManager: jest.fn(() => ({
    getSecretValue: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        SecretString: JSON.stringify({ key: 'mock-secret' })
      })
    })
  })),
  SQS: jest.fn(() => ({
    sendMessage: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({ MessageId: 'mock-message-id' })
    })
  }))
}));

// Global test utilities
global.mockAPIGatewayEvent = (overrides = {}) => ({
  httpMethod: 'GET',
  path: '/test',
  pathParameters: null,
  queryStringParameters: null,
  headers: {
    'Content-Type': 'application/json'
  },
  body: null,
  isBase64Encoded: false,
  requestContext: {
    requestId: 'test-request-id',
    stage: 'test',
    httpMethod: 'GET',
    path: '/test',
    accountId: '123456789012',
    resourceId: 'test-resource',
    identity: {
      sourceIp: '127.0.0.1',
      userAgent: 'test-agent'
    },
    authorizer: null
  },
  ...overrides
});

global.mockContext = () => ({
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'test-function',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:ap-northeast-1:123456789012:function:test-function',
  memoryLimitInMB: '128',
  awsRequestId: 'test-aws-request-id',
  logGroupName: '/aws/lambda/test-function',
  logStreamName: '2024/01/01/[$LATEST]test-stream',
  getRemainingTimeInMillis: () => 30000,
  done: jest.fn(),
  fail: jest.fn(),
  succeed: jest.fn()
});