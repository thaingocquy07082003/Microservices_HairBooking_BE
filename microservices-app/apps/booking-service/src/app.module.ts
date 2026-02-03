import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppointmentsModule } from './appointments/appointment.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { AvailabilityModule } from './availability/availability.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    AppointmentsModule,
    SchedulingModule,
    AvailabilityModule,
    QueueModule,
  ],
})
export class AppModule {}