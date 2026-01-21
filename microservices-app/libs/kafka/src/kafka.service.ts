import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { BaseEvent } from './kafka.types';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
  ) {}

  async onModuleInit() {
    await this.kafkaClient.connect();
    console.log('Kafka Client Connected');
  }

  async onModuleDestroy() {
    await this.kafkaClient.close();
  }

  /**
   * Emit an event to Kafka topic (fire and forget)
   */
  emit<T extends BaseEvent>(topic: string, data: Omit<T, 'eventId'>) {
    const event = {
      ...data,
      eventId: this.generateEventId(),
      timestamp: data.timestamp || new Date(),
    };

    this.kafkaClient.emit(topic, event);
    console.log(`[Kafka] Emitted event to topic: ${topic}`, { eventId: event.eventId });
  }

  /**
   * Send a message to Kafka and wait for response (request-response pattern)
   */
  async send<T, R>(topic: string, data: T, timeoutMs: number = 10000): Promise<R> {
    try {
      const result = await firstValueFrom(
        this.kafkaClient.send<R, T>(topic, data).pipe(
          timeout(timeoutMs),
          catchError((error) => {
            console.error(`[Kafka] Error sending to topic: ${topic}`, error);
            throw error;
          }),
        ),
      );
      return result;
    } catch (error) {
      console.error(`[Kafka] Failed to send message to topic: ${topic}`, error);
      throw error;
    }
  }

  /**
   * Subscribe to response from topics
   */
  subscribeToResponseOf(topics: string[]) {
    topics.forEach((topic) => {
      this.kafkaClient.subscribeToResponseOf(topic);
    });
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
