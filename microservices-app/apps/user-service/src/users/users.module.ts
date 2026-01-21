import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { RedisModule } from '@app/redis';
import { KafkaModule } from '@app/kafka';

@Module({
  imports: [
    RedisModule,
    KafkaModule.register({
      name: 'KAFKA_SERVICE',
      clientId: 'user-service',
      groupId: 'user-service-group',
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
