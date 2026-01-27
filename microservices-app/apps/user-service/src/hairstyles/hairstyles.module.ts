import { Module } from '@nestjs/common';
import { HairstylesController } from './hairstyles.controller';
import { HairstylesService } from './hairstyles.service';
import { RedisModule } from '@app/redis';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from '@app/common';
import { SelfUpdateGuard } from './guards/self-update.guard';

@Module({
  imports: [
    RedisModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService): JwtModuleOptions => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRATION', '15m') as any,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [HairstylesController],
  providers: [HairstylesService, JwtStrategy, SelfUpdateGuard],
  exports: [HairstylesService],
})
export class HairstylesModule {}