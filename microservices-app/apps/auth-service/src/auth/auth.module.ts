import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { join } from 'path';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SupabaseService } from '../supabase/supabase.service';
import { MailService } from '../mail/mail.service';
import { JwtStrategy } from '@app/common/strategies/jwt.strategy';
import { RedisModule } from '@app/redis';
import { KafkaModule } from '@app/kafka';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService): JwtModuleOptions => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: `${configService.get<number>('JWT_EXPIRATION') ?? 24 * 60 * 60}s`,
        },
      }),
      inject: [ConfigService],
    }),
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        // Determine template directory based on environment
        const isDev = process.env.NODE_ENV !== 'production';
        const templateDir = isDev
          ? join(process.cwd(), 'apps', 'auth-service', 'src', 'mail', 'templates')
          : join(process.cwd(), 'dist', 'apps', 'auth-service', 'mail', 'templates');

        console.log('📧 Mail template directory:', templateDir);

        return {
          transport: {
            host: configService.get<string>('MAIL_HOST'),
            port: configService.get<number>('MAIL_PORT'),
            secure: configService.get<string>('MAIL_SECURE') === 'true',
            auth: {
              user: configService.get<string>('MAIL_USER'),
              pass: configService.get<string>('MAIL_PASSWORD'),
            },
          },
          defaults: {
            from: `"${configService.get<string>('MAIL_FROM_NAME', 'No Reply')}" <${configService.get<string>('MAIL_FROM_ADDRESS')}>`,
          },
          template: {
            dir: templateDir,
            adapter: new HandlebarsAdapter(),
            options: {
              strict: true,
            },
          },
        };
      },
      inject: [ConfigService],
    }),
    RedisModule,
    KafkaModule.register({
      name: 'KAFKA_SERVICE',
      clientId: 'auth-service',
      groupId: 'auth-service-group',
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SupabaseService, MailService, JwtStrategy],
  exports: [AuthService, SupabaseService],
})
export class AuthModule {}
