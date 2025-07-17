import Redis from 'ioredis';
import { logger } from './logger';

export class CacheClient {
  private client: Redis;
  private connected: boolean = false;

  constructor(endpoint?: string) {
    const isOffline = process.env.IS_OFFLINE === 'true';
    const redisHost = endpoint || process.env.REDIS_HOST || process.env.CACHE_ENDPOINT;
    const redisPort = parseInt(process.env.REDIS_PORT || '6379');
    
    if (!redisHost) {
      logger.warn('Redis endpoint not configured, cache will be disabled');
      // Create a mock client that always returns null/false
      this.client = new Proxy({} as any, {
        get: () => () => Promise.resolve(null)
      });
      return;
    }

    const redisConfig: any = {
      host: redisHost,
      port: redisPort,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError: (err: Error) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
    };

    // Only use TLS in production
    if (!isOffline && process.env.NODE_ENV === 'production') {
      redisConfig.tls = {
        rejectUnauthorized: false,
      };
    }

    this.client = new Redis(redisConfig);

    this.client.on('connect', () => {
      this.connected = true;
      logger.info('Redis connected');
    });

    this.client.on('error', (error) => {
      this.connected = false;
      logger.error('Redis connection error', { error });
    });

    this.client.on('close', () => {
      this.connected = false;
      logger.warn('Redis connection closed');
    });
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error('Cache get error', { key, error });
      return null;
    }
  }

  async getJSON<T>(key: string): Promise<T | null> {
    try {
      const value = await this.get(key);
      if (value) {
        return JSON.parse(value) as T;
      }
      return null;
    } catch (error) {
      logger.error('Cache getJSON error', { key, error });
      return null;
    }
  }

  async setex(key: string, seconds: number, value: string): Promise<boolean> {
    return this.set(key, value, seconds);
  }

  async set(key: string, value: string, ttl?: number): Promise<boolean> {
    try {
      if (ttl) {
        await this.client.setex(key, ttl, value);
      } else {
        await this.client.set(key, value);
      }
      return true;
    } catch (error) {
      logger.error('Cache set error', { key, error });
      return false;
    }
  }

  async setJSON<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    try {
      return await this.set(key, JSON.stringify(value), ttl);
    } catch (error) {
      logger.error('Cache setJSON error', { key, error });
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error('Cache delete error', { key, error });
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error', { key, error });
      return false;
    }
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    try {
      await this.client.expire(key, ttl);
      return true;
    } catch (error) {
      logger.error('Cache expire error', { key, error });
      return false;
    }
  }

  async incr(key: string): Promise<number | null> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      logger.error('Cache incr error', { key, error });
      return null;
    }
  }

  async zadd(key: string, score: number, member: string): Promise<boolean> {
    try {
      await this.client.zadd(key, score, member);
      return true;
    } catch (error) {
      logger.error('Cache zadd error', { key, error });
      return false;
    }
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      return await this.client.zrange(key, start, stop);
    } catch (error) {
      logger.error('Cache zrange error', { key, error });
      return [];
    }
  }

  async zremrangebyscore(key: string, min: number, max: number): Promise<boolean> {
    try {
      await this.client.zremrangebyscore(key, min, max);
      return true;
    } catch (error) {
      logger.error('Cache zremrangebyscore error', { key, error });
      return false;
    }
  }

  async hget(key: string, field: string): Promise<string | null> {
    try {
      return await this.client.hget(key, field);
    } catch (error) {
      logger.error('Cache hget error', { key, field, error });
      return null;
    }
  }

  async hset(key: string, field: string, value: string): Promise<boolean> {
    try {
      await this.client.hset(key, field, value);
      return true;
    } catch (error) {
      logger.error('Cache hset error', { key, field, error });
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    if (this.client) {
      try {
        const result = await this.client.del(key);
        return result > 0;
      } catch (error) {
        logger.error('Cache del error', { key, error });
        return false;
      }
    }
    return false;
  }

  async hdel(key: string, field: string): Promise<boolean> {
    try {
      await this.client.hdel(key, field);
      return true;
    } catch (error) {
      logger.error('Cache hdel error', { key, field, error });
      return false;
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      return await this.client.hgetall(key);
    } catch (error) {
      logger.error('Cache hgetall error', { key, error });
      return {};
    }
  }

  async keys(pattern: string): Promise<string[]> {
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      logger.error('Cache keys error', { pattern, error });
      return [];
    }
  }

  async flushPattern(pattern: string): Promise<boolean> {
    try {
      const keys = await this.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
      return true;
    } catch (error) {
      logger.error('Cache flushPattern error', { pattern, error });
      return false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.quit();
    } catch (error) {
      logger.error('Cache disconnect error', { error });
    }
  }
}

// Singleton instance
let cacheClient: CacheClient | null = null;

export const getCacheClient = (): CacheClient => {
  if (!cacheClient) {
    cacheClient = new CacheClient();
  }
  return cacheClient;
};

// Cache key generators
export const CacheKeys = {
  bookingSlot: (clinicId: string, date: string, time: string) => 
    `booking:slot:${clinicId}:${date}:${time}`,
  
  doctorSchedule: (doctorId: string, date: string) => 
    `schedule:doctor:${doctorId}:${date}`,
  
  clinicSchedule: (clinicId: string, date: string) => 
    `schedule:clinic:${clinicId}:${date}`,
  
  waitingTime: (clinicId: string, date: string) => 
    `waiting:${clinicId}:${date}`,
  
  userSession: (userId: string) => 
    `session:user:${userId}`,
  
  rateLimit: (userId: string, endpoint: string, window: string) => 
    `ratelimit:${userId}:${endpoint}:${window}`,
  
  notification: (userId: string, type: string) => 
    `notification:${userId}:${type}`,
  
  qrCode: (code: string) => 
    `qr:${code}`,
};