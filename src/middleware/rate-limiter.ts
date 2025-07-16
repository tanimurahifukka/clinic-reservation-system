import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getCacheClient, CacheKeys } from '../utils/cache-client';
import { logger } from '../utils/logger';
import { errorResponse } from '../utils/response';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (event: APIGatewayProxyEvent) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60000, // 1 minute
  maxRequests: 10,
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  message: 'Too many requests, please try again later.',
};

// Endpoint-specific rate limits
const RATE_LIMITS: Record<string, Partial<RateLimitConfig>> = {
  'POST /bookings': {
    windowMs: 60000,
    maxRequests: 10,
  },
  'GET /bookings': {
    windowMs: 60000,
    maxRequests: 30,
  },
  'POST /auth/login': {
    windowMs: 300000, // 5 minutes
    maxRequests: 5,
  },
  'POST /payments': {
    windowMs: 60000,
    maxRequests: 5,
  },
  'POST /line/webhook': {
    windowMs: 1000,
    maxRequests: 10,
  },
};

class RateLimiter {
  private dynamoClient: DynamoDBDocumentClient;
  private tableName: string;
  private cache = getCacheClient();

  constructor() {
    const client = new DynamoDBClient({ region: process.env.REGION });
    this.dynamoClient = DynamoDBDocumentClient.from(client);
    this.tableName = process.env.RATE_LIMIT_TABLE_NAME || '';
  }

  private getKeyGenerator(event: APIGatewayProxyEvent): string {
    // Extract user ID from JWT token if authenticated
    const authContext = event.requestContext.authorizer;
    if (authContext?.claims?.sub) {
      return authContext.claims.sub;
    }

    // Fall back to IP address
    const ip = event.requestContext.identity.sourceIp || 'unknown';
    return `ip:${ip}`;
  }

  private getEndpointKey(event: APIGatewayProxyEvent): string {
    const method = event.httpMethod;
    const path = event.path;
    return `${method} ${path}`;
  }

  async checkRateLimit(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult | null> {
    try {
      const endpoint = this.getEndpointKey(event);
      const config = { ...DEFAULT_CONFIG, ...RATE_LIMITS[endpoint] };
      const identifier = config.keyGenerator?.(event) || this.getKeyGenerator(event);
      
      const now = Date.now();
      const window = Math.floor(now / config.windowMs) * config.windowMs;
      const key = CacheKeys.rateLimit(identifier, endpoint, window.toString());

      // Try cache first for better performance
      let count = await this.checkCache(key, config.windowMs);
      
      if (count === null) {
        // Fallback to DynamoDB
        count = await this.checkDynamoDB(key, window, config.windowMs);
      }

      if (count > config.maxRequests) {
        logger.warn('Rate limit exceeded', { 
          identifier, 
          endpoint, 
          count, 
          limit: config.maxRequests 
        });

        return errorResponse(429, config.message || 'Too many requests', {
          retryAfter: Math.ceil((window + config.windowMs - now) / 1000),
        });
      }

      return null; // Request allowed
    } catch (error) {
      logger.error('Rate limit check failed', { error });
      // Fail open - allow request if rate limiting fails
      return null;
    }
  }

  private async checkCache(key: string, windowMs: number): Promise<number | null> {
    try {
      const count = await this.cache.incr(key);
      
      if (count === 1) {
        // First request in this window
        await this.cache.expire(key, Math.ceil(windowMs / 1000));
      }

      return count;
    } catch (error) {
      logger.error('Cache rate limit check failed', { error });
      return null;
    }
  }

  private async checkDynamoDB(key: string, window: number, windowMs: number): Promise<number> {
    try {
      const ttl = Math.floor((window + windowMs) / 1000);

      const updateParams = {
        TableName: this.tableName,
        Key: { pk: key, window },
        UpdateExpression: 'ADD #count :inc SET #ttl = :ttl',
        ExpressionAttributeNames: {
          '#count': 'count',
          '#ttl': 'ttl',
        },
        ExpressionAttributeValues: {
          ':inc': 1,
          ':ttl': ttl,
        },
        ReturnValues: 'ALL_NEW' as const,
      };

      const result = await this.dynamoClient.send(new UpdateCommand(updateParams));
      return result.Attributes?.count || 1;
    } catch (error) {
      logger.error('DynamoDB rate limit check failed', { error });
      throw error;
    }
  }
}

// Middleware factory
export const createRateLimitMiddleware = (customConfig?: Partial<RateLimitConfig>) => {
  const rateLimiter = new RateLimiter();
  
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult | null> => {
    return rateLimiter.checkRateLimit(event);
  };
};

// Token bucket algorithm for more sophisticated rate limiting
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number;

  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  consume(tokens: number = 1): boolean {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = (timePassed / 1000) * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}