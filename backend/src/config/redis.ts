import { createClient, RedisClientType } from 'redis';
import { config } from './config';
import { logger } from '../utils/logger';

class RedisConnection {
  private client: RedisClientType | null = null;
  private subscriber: RedisClientType | null = null;
  private publisher: RedisClientType | null = null;

  async connect(): Promise<void> {
    try {
      // Skip Redis if no URL provided
      if (!config.database.redisUrl || config.database.redisUrl.trim() === '') {
        logger.info('🔴 Redis URL not provided - continuing without cache (this is normal in development)');
        return;
      }

      // Check if Redis URL is properly formatted
      if (!config.database.redisUrl.startsWith('redis://') && !config.database.redisUrl.startsWith('rediss://')) {
        logger.warn('🔴 Redis URL format invalid - should start with redis:// or rediss:// - continuing without cache');
        return;
      }

      // Main Redis client
      this.client = createClient({
        url: config.database.redisUrl,
        socket: {
          reconnectStrategy: (retries: number) => {
            if (retries > 5) return null; // Give up after 5 attempts
            return Math.min(retries * 100, 2000);
          }
        }
      });

      // Subscriber client for pub/sub
      this.subscriber = createClient({
        url: config.database.redisUrl,
        socket: {
          reconnectStrategy: (retries: number) => {
            if (retries > 5) return null;
            return Math.min(retries * 100, 2000);
          }
        }
      });

      // Publisher client for pub/sub
      this.publisher = createClient({
        url: config.database.redisUrl,
        socket: {
          reconnectStrategy: (retries: number) => {
            if (retries > 5) return null;
            return Math.min(retries * 100, 2000);
          }
        }
      });

      // Error handling with graceful degradation
      this.client.on('error', (error: Error) => {
        logger.warn('Redis client error - continuing without cache:', error.message);
        this.client = null;
      });

      this.subscriber.on('error', (error: Error) => {
        logger.warn('Redis subscriber error - continuing without real-time features:', error.message);
        this.subscriber = null;
      });

      this.publisher.on('error', (error: Error) => {
        logger.warn('Redis publisher error - continuing without real-time features:', error.message);
        this.publisher = null;
      });

      // Connection events
      this.client.on('connect', () => {
        logger.info('🔴 Redis client connected');
      });

      this.client.on('ready', () => {
        logger.info('🔴 Redis client ready');
      });

      this.client.on('reconnecting', () => {
        logger.warn('🔴 Redis client reconnecting...');
      });

      // Connect all clients with timeout
      const connectTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis connection timeout after 10 seconds')), 10000)
      );
      
      logger.info(`🔴 Attempting to connect to Redis at: ${config.database.redisUrl.replace(/\/\/[^@]*@/, '//*****@')}`);
      
      await Promise.race([
        Promise.all([
          this.client.connect(),
          this.subscriber.connect(),
          this.publisher.connect()
        ]),
        connectTimeout
      ]);

      logger.info('🔴 Redis connections established successfully');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('🔴 Redis connection failed - continuing without cache');
      logger.warn('🔴 Error details:', errorMessage);
      logger.info('🔴 This is not critical - the application will work without Redis caching');
      
      // Don't throw - continue without Redis
      this.client = null;
      this.subscriber = null;
      this.publisher = null;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client?.isOpen) {
        await this.client.quit();
      }
      if (this.subscriber?.isOpen) {
        await this.subscriber.quit();
      }
      if (this.publisher?.isOpen) {
        await this.publisher.quit();
      }
      logger.info('Redis connections closed successfully');
    } catch (error) {
      logger.error('Error disconnecting Redis:', error);
    }
  }

  getClient(): RedisClientType | null {
    if (!this.client) {
      logger.debug('Redis client is not initialized');
      return null;
    }
    if (!this.client.isOpen) {
      logger.debug('Redis client is not connected');
      return null;
    }
    return this.client;
  }

  getSubscriber(): RedisClientType | null {
    if (!this.subscriber) {
      logger.debug('Redis subscriber is not initialized');
      return null;
    }
    if (!this.subscriber.isOpen) {
      logger.debug('Redis subscriber is not connected');
      return null;
    }
    return this.subscriber;
  }

  getPublisher(): RedisClientType | null {
    if (!this.publisher) {
      logger.debug('Redis publisher is not initialized');
      return null;
    }
    if (!this.publisher.isOpen) {
      logger.debug('Redis publisher is not connected');
      return null;
    }
    return this.publisher;
  }

  isConnected(): boolean {
    return !!(this.client?.isOpen && this.subscriber?.isOpen && this.publisher?.isOpen);
  }
}

// Singleton instance
const redisConnection = new RedisConnection();

export const connectRedis = async (): Promise<void> => {
  return redisConnection.connect();
};

export const disconnectRedis = async (): Promise<void> => {
  return redisConnection.disconnect();
};

export const getRedisClient = (): RedisClientType | null => {
  return redisConnection.getClient();
};

export const getRedisClientSafe = (): RedisClientType | null => {
  try {
    if (redisConnection.isConnected()) {
      return redisConnection.getClient();
    }
    return null;
  } catch (error) {
    return null;
  }
};

export const getRedisSubscriber = (): RedisClientType | null => {
  return redisConnection.getSubscriber();
};

export const getRedisPublisher = (): RedisClientType | null => {
  return redisConnection.getPublisher();
};

export const isRedisConnected = (): boolean => {
  return redisConnection.isConnected();
};

// Cache utility functions
export class RedisCache {
  private client: RedisClientType | null = null;

  private getClient(): RedisClientType | null {
    if (!this.client) {
      const client = getRedisClientSafe();
      if (!client) {
        return null;
      }
      this.client = client;
    }
    return this.client;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const client = this.getClient();
      if (!client) {
        return null;
      }
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`Redis get error for key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    try {
      const client = this.getClient();
      if (!client) {
        return false;
      }
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await client.setEx(key, ttlSeconds, serialized);
      } else {
        await client.set(key, serialized);
      }
      return true;
    } catch (error) {
      logger.error(`Redis set error for key ${key}:`, error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      const client = this.getClient();
      if (!client) {
        return false;
      }
      const result = await client.del(key);
      return result > 0;
    } catch (error) {
      logger.error(`Redis delete error for key ${key}:`, error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const client = this.getClient();
      if (!client) {
        return false;
      }
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Redis exists error for key ${key}:`, error);
      return false;
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const client = this.getClient();
      if (!client) {
        return false;
      }
      const result = await client.expire(key, ttlSeconds);
      return result === true;
    } catch (error) {
      logger.error(`Redis expire error for key ${key}:`, error);
      return false;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    try {
      const client = this.getClient();
      if (!client) {
        return [];
      }
      return await client.keys(pattern);
    } catch (error) {
      logger.error(`Redis keys error for pattern ${pattern}:`, error);
      return [];
    }
  }

  async hset(key: string, field: string, value: any): Promise<boolean> {
    try {
      const client = this.getClient();
      if (!client) {
        return false;
      }
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      const result = await client.hSet(key, field, serialized);
      return result >= 0;
    } catch (error) {
      logger.error(`Redis hset error for key ${key}, field ${field}:`, error);
      return false;
    }
  }

  async hget(key: string, field: string): Promise<string | null> {
    try {
      const client = this.getClient();
      if (!client) {
        return null;
      }
      return await client.hGet(key, field);
    } catch (error) {
      logger.error(`Redis hget error for key ${key}, field ${field}:`, error);
      return null;
    }
  }

  async incr(key: string): Promise<number> {
    try {
      const client = this.getClient();
      if (!client) {
        return 0;
      }
      return await client.incr(key);
    } catch (error) {
      logger.error(`Redis incr error for key ${key}:`, error);
      return 0;
    }
  }

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    try {
      const client = this.getClient();
      if (!client) {
        return 0;
      }
      return await client.hIncrBy(key, field, increment);
    } catch (error) {
      logger.error(`Redis hincrby error for key ${key}, field ${field}:`, error);
      return 0;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      const client = this.getClient();
      if (!client) {
        return -1;
      }
      return await client.ttl(key);
    } catch (error) {
      logger.error(`Redis ttl error for key ${key}:`, error);
      return -1;
    }
  }

  async lpush(key: string, ...values: any[]): Promise<number> {
    try {
      const client = this.getClient();
      if (!client) {
        return 0;
      }
      const serializedValues = values.map(value => 
        typeof value === 'string' ? value : JSON.stringify(value)
      );
      const result = await client.lPush(key, serializedValues);
      return result;
    } catch (error) {
      logger.error(`Redis lpush error for key ${key}:`, error);
      return 0;
    }
  }

  async ltrim(key: string, start: number, stop: number): Promise<boolean> {
    try {
      const client = this.getClient();
      if (!client) {
        return false;
      }
      await client.lTrim(key, start, stop);
      return true;
    } catch (error) {
      logger.error(`Redis ltrim error for key ${key}:`, error);
      return false;
    }
  }

  async info(section?: string): Promise<string> {
    try {
      const client = this.getClient();
      if (!client) {
        return '';
      }
      return await client.info(section);
    } catch (error) {
      logger.error(`Redis info error:`, error);
      return '';
    }
  }

  async sadd(key: string, ...members: any[]): Promise<number> {
    try {
      const client = this.getClient();
      if (!client) {
        return 0;
      }
      const serializedMembers = members.map(member => 
        typeof member === 'string' ? member : JSON.stringify(member)
      );
      return await client.sAdd(key, serializedMembers);
    } catch (error) {
      logger.error(`Redis sadd error for key ${key}:`, error);
      return 0;
    }
  }

  async smembers(key: string): Promise<string[]> {
    try {
      const client = this.getClient();
      if (!client) {
        return [];
      }
      return await client.sMembers(key);
    } catch (error) {
      logger.error(`Redis smembers error for key ${key}:`, error);
      return [];
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      const client = this.getClient();
      if (!client) {
        return {};
      }
      return await client.hGetAll(key);
    } catch (error) {
      logger.error(`Redis hgetall error for key ${key}:`, error);
      return {};
    }
  }
}

// Export singleton cache instance - lazily initialized
let redisCacheInstance: RedisCache | null = null;

export const redisCache = new Proxy({} as RedisCache, {
  get(target, prop) {
    if (!redisCacheInstance) {
      redisCacheInstance = new RedisCache();
    }
    return (redisCacheInstance as any)[prop];
  }
});