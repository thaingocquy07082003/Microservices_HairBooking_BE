import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.BOOKING_SERVICE_PORT || 3003;

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Enable CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // API prefix
  app.setGlobalPrefix('api/v1');

  // Connect microservice for Kafka
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'booking-service',
        brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      },
      consumer: {
        groupId: 'booking-service-group',
        allowAutoTopicCreation: true,
        retry: {
          initialRetryTime: 300,
          retries: 10,
        },
      },
      subscribe: {
        fromBeginning: false,
      },
    },
  });

  // Start all microservices
  try {
    await app.startAllMicroservices();
    console.log(`📨 Kafka consumer connected`);
  } catch (error) {
    console.warn('⚠️ Kafka connection failed, running without Kafka:', error);
  }

  // Start HTTP server
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Booking Service is running on: http://localhost:${port}/api/v1`);
}

bootstrap();