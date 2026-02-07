import { Module } from '@nestjs/common';
import { BranchesController } from './branch.controller';
import { BranchesService } from './branch.service';
import { RedisModule } from '@app/redis';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from '@app/common';
import {
  BranchManagementGuard,
  BranchStaffManagementGuard,
  BranchReportsGuard,
  SystemAdminGuard,
} from './guard/branch.guard';

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
  controllers: [BranchesController],
  providers: [
    BranchesService,
    JwtStrategy,
    BranchManagementGuard,
    BranchStaffManagementGuard,
    BranchReportsGuard,
    SystemAdminGuard,
  ],
  exports: [BranchesService],
})
export class BranchesModule {}