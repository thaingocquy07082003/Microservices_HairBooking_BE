import { Module } from '@nestjs/common';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { KafkaModule } from '@app/kafka';
import { RedisModule } from '@app/redis';

@Module({
  imports: [
    KafkaModule.register({
      name: 'KAFKA_SERVICE',
      clientId: 'booking-service',
      groupId: 'booking-service-group',
    }),
    RedisModule,
  ],
  controllers: [InvoiceController],
  providers: [InvoiceService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
