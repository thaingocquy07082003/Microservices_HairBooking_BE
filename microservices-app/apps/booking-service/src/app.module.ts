import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppointmentsModule } from './appointments/appointment.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { AvailabilityModule } from './availability/availability.module';
import { QueueModule } from './queue/queue.module';
import { PaymentModule } from './payment/payment.module';
import { InvoiceModule } from './invoice/invoice.module';
import { StatsModule } from './stats/stats.module';
import { ServiceManagementModule } from './service/service.module';

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
    PaymentModule,
    InvoiceModule,
    StatsModule,
    ServiceManagementModule,
  ],
})
export class AppModule {}