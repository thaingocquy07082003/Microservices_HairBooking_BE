import { Injectable } from '@nestjs/common';
import { RedisService } from '@app/redis';

@Injectable()
export class UsersService {
  constructor(private readonly redisService: RedisService) {}

  async getUserById(userId: string) {
    // Check cache first
    const cachedUser = await this.redisService.get<any>(`user:${userId}`);
    if (cachedUser) {
      return cachedUser;
    }

    // TODO: Fetch from database
    return null;
  }

  async cacheUser(userId: string, userData: any, ttl: number = 3600) {
    await this.redisService.set(`user:${userId}`, userData, ttl);
  }
}
