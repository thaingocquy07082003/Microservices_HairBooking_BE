import { Module } from '@nestjs/common';
import { HairTryOnController } from './hair-tryon.controller';
import { HairTryOnService } from './hair-tryon.service';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy, FileUploadService } from '@app/common';

@Module({
  imports: [
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
  controllers: [HairTryOnController],
  providers: [HairTryOnService, JwtStrategy, FileUploadService],
  exports: [HairTryOnService],
})
export class HairTryOnModule {}