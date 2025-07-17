import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getAuroraClient } from '../../utils/aurora-client';
import { getCacheClient } from '../../utils/cache-client';
import { createResponse, createErrorResponse } from '../../utils/response';
import { logger } from '../../utils/logger';

interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  error?: string;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  const checks: HealthCheckResult[] = [];

  try {
    // Check Aurora database
    const dbCheck = await checkDatabase();
    checks.push(dbCheck);

    // Check Redis cache
    const cacheCheck = await checkCache();
    checks.push(cacheCheck);

    // Determine overall health status
    const hasUnhealthy = checks.some(check => check.status === 'unhealthy');
    const hasDegraded = checks.some(check => check.status === 'degraded');
    
    const overallStatus = hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy';
    const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

    const response = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      service: 'clinic-reservation-system',
      version: process.env.SERVICE_VERSION || '1.0.0',
      environment: process.env.STAGE || 'dev',
      region: process.env.AWS_REGION || 'ap-northeast-1',
      uptime: process.uptime(),
      responseTime: Date.now() - startTime,
      checks,
      metadata: {
        requestId: event.requestContext.requestId,
        sourceIp: event.requestContext.identity?.sourceIp,
      }
    };

    return createResponse(statusCode, response);

  } catch (error: any) {
    logger.error('Health check failed', { error: error.message });
    
    return createErrorResponse(503, 'Service unavailable', {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
};

async function checkDatabase(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    const auroraClient = getAuroraClient();
    const result = await auroraClient.query('SELECT 1 as health_check');
    
    const latency = Date.now() - start;
    
    return {
      service: 'aurora-database',
      status: latency < 1000 ? 'healthy' : 'degraded',
      latency
    };
  } catch (error: any) {
    logger.error('Database health check failed', { error: error.message });
    
    return {
      service: 'aurora-database',
      status: 'unhealthy',
      latency: Date.now() - start,
      error: error.message
    };
  }
}

async function checkCache(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    const cacheClient = getCacheClient();
    
    // Test write and read
    const testKey = `health-check-${Date.now()}`;
    const testValue = 'healthy';
    
    await cacheClient.set(testKey, testValue, 10); // 10 second TTL
    const retrieved = await cacheClient.get(testKey);
    
    if (retrieved !== testValue) {
      throw new Error('Cache read/write test failed');
    }
    
    // Clean up
    await cacheClient.del(testKey);
    
    const latency = Date.now() - start;
    
    return {
      service: 'redis-cache',
      status: latency < 100 ? 'healthy' : 'degraded',
      latency
    };
  } catch (error: any) {
    // Cache is optional, so we return degraded instead of unhealthy
    logger.warn('Cache health check failed', { error: error.message });
    
    return {
      service: 'redis-cache',
      status: 'degraded',
      latency: Date.now() - start,
      error: error.message
    };
  }
}