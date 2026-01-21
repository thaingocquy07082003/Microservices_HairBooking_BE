import { Module, DynamicModule, Global } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { KafkaService } from './kafka.service';

export interface KafkaModuleOptions {
  name: string;
  clientId?: string;
  groupId?: string;
}

@Global()
@Module({})
export class KafkaModule {
  static register(options: KafkaModuleOptions): DynamicModule {
    return {
      module: KafkaModule,
      imports: [
        ClientsModule.registerAsync([
          {
            name: options.name,
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
              transport: Transport.KAFKA,
              options: {
                client: {
                  clientId: options.clientId || 'microservices',
                  brokers: configService
                    .get<string>('KAFKA_BROKERS', 'localhost:9092')
                    .split(','),
                },
                consumer: {
                  groupId: options.groupId || 'default-group',
                  allowAutoTopicCreation: true,
                },
                producer: {
                  allowAutoTopicCreation: true,
                },
              },
            }),
            inject: [ConfigService],
          },
        ]),
      ],
      providers: [
        KafkaService,
        {
          provide: 'KAFKA_OPTIONS',
          useValue: options,
        },
      ],
      exports: [ClientsModule, KafkaService],
    };
  }
}
