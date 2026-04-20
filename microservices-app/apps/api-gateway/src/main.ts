import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.API_GATEWAY_PORT || process.env.PORT || 3000;

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Enable CORS - Allow all origins
  app.enableCors();

  // API prefix
  app.setGlobalPrefix('api/v1');

  await app.listen(port, '0.0.0.0');
  console.log(`🚀 API Gateway is running on: http://localhost:${port}/api/v1`);
}

bootstrap();
