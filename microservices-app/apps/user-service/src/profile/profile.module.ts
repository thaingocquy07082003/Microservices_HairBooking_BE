import { Module } from '@nestjs/common';
import { ProfilesController } from './profile.controller';
import { ProfilesService } from './profile.service';
import { RedisModule } from '@app/redis';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from '@app/common';
import { ProfileUpdateGuard, ViewProfilesListGuard } from './guards/profile.guard';

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
  controllers: [ProfilesController],
  providers: [ProfilesService, JwtStrategy, ProfileUpdateGuard, ViewProfilesListGuard],
  exports: [ProfilesService],
})
export class ProfilesModule {}