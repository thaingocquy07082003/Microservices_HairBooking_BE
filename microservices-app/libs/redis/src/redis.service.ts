/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis.Redis;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.client = new Redis.default({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error', err);
    });

    this.client.on('connect', () => {
      console.log('Redis Client Connected');
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  getClient(): Redis.Redis {
    return this.client;
  }

  // OTP Methods
  async setOtp(
    email: string,
    otp: string,
    expirySeconds: number = 120,
  ): Promise<void> {
    const key = `otp:${email}`;
    await this.client.setex(key, expirySeconds, otp);
  }

  async getOtp(email: string): Promise<string | null> {
    const key = `otp:${email}`;
    return await this.client.get(key);
  }

  async deleteOtp(email: string): Promise<void> {
    const key = `otp:${email}`;
    await this.client.del(key);
  }

  async getOtpTtl(email: string): Promise<number> {
    const key = `otp:${email}`;
    return await this.client.ttl(key);
  }

  // Session Methods
  async setSession(
    sessionId: string,
    data: any,
    expirySeconds: number = 86400,
  ): Promise<void> {
    const key = `session:${sessionId}`;
    await this.client.setex(key, expirySeconds, JSON.stringify(data));
  }

  async getSession(sessionId: string): Promise<any> {
    const key = `session:${sessionId}`;
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const key = `session:${sessionId}`;
    await this.client.del(key);
  }

  // Cache Methods
  async set(key: string, value: any, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttl) {
      await this.client.setex(key, ttl, serialized);
    } else {
      await this.client.set(key, serialized);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  // Rate Limiting
  async incrementCounter(
    key: string,
    expirySeconds: number = 60,
  ): Promise<number> {
    const current = await this.client.incr(key);
    if (current === 1) {
      await this.client.expire(key, expirySeconds);
    }
    return current;
  }

  async getCounter(key: string): Promise<number> {
    const value = await this.client.get(key);
    return value ? parseInt(value, 10) : 0;
  }

  // Token Blacklist (for logout/revoke)
  async addToBlacklist(
    token: string,
    expirySeconds: number = 86400,
  ): Promise<void> {
    const key = `blacklist:${token}`;
    await this.client.setex(key, expirySeconds, '1');
  }

  async isBlacklisted(token: string): Promise<boolean> {
    const key = `blacklist:${token}`;
    const result = await this.client.exists(key);
    return result === 1;
  }

  // Refresh Token Methods
  async setRefreshToken(
    userId: string,
    refreshToken: string,
    expirySeconds: number = 604800, // 7 days
  ): Promise<void> {
    const key = `refresh:${userId}`;
    await this.client.setex(key, expirySeconds, refreshToken);
  }

  async getRefreshToken(userId: string): Promise<string | null> {
    const key = `refresh:${userId}`;
    return await this.client.get(key);
  }

  async deleteRefreshToken(userId: string): Promise<void> {
    const key = `refresh:${userId}`;
    await this.client.del(key);
  }

  // User Session Tracking
  async addUserSession(userId: string, sessionId: string): Promise<void> {
    const key = `user:sessions:${userId}`;
    await this.client.sadd(key, sessionId);
  }

  async getUserSessions(userId: string): Promise<string[]> {
    const key = `user:sessions:${userId}`;
    return await this.client.smembers(key);
  }

  async removeUserSession(userId: string, sessionId: string): Promise<void> {
    const key = `user:sessions:${userId}`;
    await this.client.srem(key, sessionId);
  }

  async clearUserSessions(userId: string): Promise<void> {
    const key = `user:sessions:${userId}`;
    await this.client.del(key);
  }
}
