import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthGatewayController } from './auth/auth.controller';

// Check if Kafka should be enabled
const ENABLE_KAFKA = process.env.ENABLE_KAFKA === 'true';

@Module({
  imports: [
    // Config Module
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),

    // HTTP Module for proxying requests
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),

    // Kafka Client for internal microservice communication (optional)
    ...(ENABLE_KAFKA
      ? [
          ClientsModule.registerAsync([
            {
              name: 'AUTH_SERVICE',
              imports: [ConfigModule],
              useFactory: (configService: ConfigService) => ({
                transport: Transport.KAFKA,
                options: {
                  client: {
                    clientId: 'api-gateway',
                    brokers: (
                      configService.get<string>('KAFKA_BROKERS') ||
                      'localhost:9092'
                    ).split(','),
                  },
                  consumer: {
                    groupId: 'api-gateway-group',
                  },
                },
              }),
              inject: [ConfigService],
            },
          ]),
        ]
      : []),
  ],
  controllers: [AppController, AuthGatewayController],
  providers: [AppService],
})
export class AppModule {}
