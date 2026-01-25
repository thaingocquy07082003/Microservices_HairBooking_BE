import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from '@app/common/filters/http-exception.filter';

async function bootstrap() {
  // Create HTTP application
  const app = await NestFactory.create(AppModule);
  const port = process.env.AUTH_SERVICE_PORT || 3001;

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global filters
  app.useGlobalFilters(new HttpExceptionFilter());

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
        clientId: 'auth-service',
        brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      },
      consumer: {
        groupId: 'auth-service-group',
        allowAutoTopicCreation: true,
      },
    },
  });

  // Start all microservices
  await app.startAllMicroservices();

  // Start HTTP server
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Auth Service is running on: http://localhost:${port}/api/v1`);
  console.log(`📨 Kafka consumer connected`);
}

bootstrap();
