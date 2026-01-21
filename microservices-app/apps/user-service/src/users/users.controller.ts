/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Controller, Get } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { UsersService } from './users.service';
import { KafkaTopics } from '@app/kafka';

interface UserRegisteredPayload {
  userId: string;
  email: string;
  fullName: string;
  timestamp: Date;
}

interface UserVerifiedPayload {
  userId: string;
  email: string;
  timestamp: Date;
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('health')
  healthCheck() {
    return { status: 'ok', service: 'user-service' };
  }

  // Kafka event handlers (fire-and-forget, no response needed)
  @EventPattern(KafkaTopics.USER_REGISTERED)
  async handleUserRegistered(@Payload() data: UserRegisteredPayload) {
    console.log('📥 User registered event received:', data);
    // Cache user info
    await this.usersService.cacheUser(data.userId, {
      email: data.email,
      fullName: data.fullName,
      registeredAt: data.timestamp,
    });
  }

  @EventPattern(KafkaTopics.USER_VERIFIED)
  async handleUserVerified(@Payload() data: UserVerifiedPayload) {
    console.log('📥 User verified event received:', data);
    // Update cached user
    const cachedUser = await this.usersService.getUserById(data.userId);
    if (cachedUser) {
      await this.usersService.cacheUser(data.userId, {
        ...cachedUser,
        verified: true,
        verifiedAt: data.timestamp,
      });
    }
  }
}
