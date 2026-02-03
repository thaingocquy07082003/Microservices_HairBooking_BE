import { 
  Injectable, 
  NotFoundException, 
  BadRequestException 
} from '@nestjs/common';
import { RedisService } from '@app/redis';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { AppointmentQueue, QueueStatus } from '@app/common/entities/booking.entity';
import {
  AddToQueueDto,
  UpdateQueueDto,
  MoveQueuePositionDto,
  GetQueueDto,
  CallNextDto,
} from './dto/queue.dto';

@Injectable()
export class QueueService {
  private supabase: SupabaseClient;
  
  private readonly CACHE_TTL = {
    QUEUE: 60, // 1 minute (frequently updated)
  };

  private readonly CACHE_KEYS = {
    queueList: (filter: string) => `queue:list:${filter}`,
    queueItem: (id: string) => `queue:item:${id}`,
  };

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.supabase = createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_SERVICE_KEY'),
    );
  }

  // ==================== ADD TO QUEUE ====================

  async addToQueue(dto: AddToQueueDto): Promise<AppointmentQueue> {
    // Verify appointment exists and is confirmed
    const { data: appointment, error: aptError } = await this.supabase
      .from('appointments')
      .select('*')
      .eq('id', dto.appointmentId)
      .single();

    if (aptError || !appointment) {
      throw new NotFoundException(`Không tìm thấy lịch hẹn với ID: ${dto.appointmentId}`);
    }

    if (appointment.status !== 'confirmed') {
      throw new BadRequestException('Chỉ có thể thêm lịch hẹn đã xác nhận vào hàng đợi');
    }

    // Check if already in queue
    const { data: existing } = await this.supabase
      .from('appointment_queue')
      .select('id')
      .eq('appointment_id', dto.appointmentId)
      .single();

    if (existing) {
      throw new BadRequestException('Lịch hẹn đã có trong hàng đợi');
    }

    // Calculate queue position
    const { count } = await this.supabase
      .from('appointment_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', QueueStatus.WAITING);

    const queuePosition = (count || 0) + 1;

    // Create queue entry
    const { data: queueItem, error } = await this.supabase
      .from('appointment_queue')
      .insert({
        appointment_id: dto.appointmentId,
        queue_position: queuePosition,
        estimated_wait_minutes: dto.estimatedWaitMinutes || 0,
        status: QueueStatus.WAITING,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi thêm vào hàng đợi: ${error.message}`);
    }

    await this.invalidateQueueCache();

    return this.mapQueueFromDb(queueItem);
  }

  // ==================== GET QUEUE ====================

  async getQueue(filter: GetQueueDto): Promise<AppointmentQueue[]> {
    const cacheKey = this.CACHE_KEYS.queueList(JSON.stringify(filter));
    const cached = await this.redisService.get<AppointmentQueue[]>(cacheKey);
    if (cached) {
      return cached;
    }

    let query = this.supabase.from('appointment_queue').select('*');

    if (filter.includeAppointmentDetails) {
      query = this.supabase
        .from('appointment_queue')
        .select(`
          *,
          appointments (
            *,
            stylists (
              full_name,
              avatar_url
            ),
            hairstyles (
              name,
              duration
            )
          )
        `);
    }

    if (filter.status) {
      query = query.eq('status', filter.status);
    }

    if (filter.stylistId) {
      // Need to join with appointments to filter by stylist
      query = query.eq('appointments.stylist_id', filter.stylistId);
    }

    query = query.order('queue_position', { ascending: true });

    const { data, error } = await query;

    if (error) {
      throw new BadRequestException(`Lỗi khi lấy hàng đợi: ${error.message}`);
    }

    const queueItems = (data || []).map(q => this.mapQueueFromDb(q));

    await this.redisService.set(cacheKey, queueItems, this.CACHE_TTL.QUEUE);

    return queueItems;
  }

  // ==================== CALL NEXT IN QUEUE ====================

  async callNext(dto: CallNextDto): Promise<AppointmentQueue | null> {
    let query = this.supabase
      .from('appointment_queue')
      .select(`
        *,
        appointments!inner (
          stylist_id
        )
      `)
      .eq('status', QueueStatus.WAITING)
      .order('queue_position', { ascending: true })
      .limit(1);

    if (dto.stylistId) {
      query = query.eq('appointments.stylist_id', dto.stylistId);
    }

    const { data, error } = await query;

    if (error) {
      throw new BadRequestException(`Lỗi khi gọi khách tiếp theo: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return null;
    }

    const nextInQueue = data[0];

    // Update status to called
    const { data: updated, error: updateError } = await this.supabase
      .from('appointment_queue')
      .update({
        status: QueueStatus.CALLED,
        notified: dto.sendNotification || false,
        notified_at: dto.sendNotification ? new Date().toISOString() : null,
      })
      .eq('id', nextInQueue.id)
      .select()
      .single();

    if (updateError) {
      throw new BadRequestException(`Lỗi khi cập nhật hàng đợi: ${updateError.message}`);
    }

    // TODO: Send notification if dto.sendNotification = true

    await this.invalidateQueueCache();

    return this.mapQueueFromDb(updated);
  }

  // ==================== UPDATE QUEUE ====================

  async updateQueue(id: string, dto: UpdateQueueDto): Promise<AppointmentQueue> {
    const updateData: any = {};
    if (dto.status) updateData.status = dto.status;
    if (dto.queuePosition) updateData.queue_position = dto.queuePosition;
    if (dto.estimatedWaitMinutes !== undefined) updateData.estimated_wait_minutes = dto.estimatedWaitMinutes;

    const { data: queueItem, error } = await this.supabase
      .from('appointment_queue')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi cập nhật hàng đợi: ${error.message}`);
    }

    // If status changed to serving, update appointment status
    if (dto.status === QueueStatus.SERVING) {
      await this.supabase
        .from('appointments')
        .update({ status: 'in_progress' })
        .eq('id', queueItem.appointment_id);
    }

    await this.invalidateQueueCache();

    return this.mapQueueFromDb(queueItem);
  }

  // ==================== MOVE QUEUE POSITION ====================

  async moveQueuePosition(id: string, dto: MoveQueuePositionDto): Promise<AppointmentQueue> {
    // Get current queue item
    const { data: current } = await this.supabase
      .from('appointment_queue')
      .select('*')
      .eq('id', id)
      .single();

    if (!current) {
      throw new NotFoundException(`Không tìm thấy queue item với ID: ${id}`);
    }

    const oldPosition = current.queue_position;
    const newPosition = dto.newPosition;

    if (oldPosition === newPosition) {
      return this.mapQueueFromDb(current);
    }

    // Shift other items
    if (newPosition < oldPosition) {
      // Moving up: increment positions between new and old
      await this.supabase
        .from('appointment_queue')
        .update({ queue_position: this.supabase.rpc('increment_position') })
        .gte('queue_position', newPosition)
        .lt('queue_position', oldPosition)
        .neq('id', id);
    } else {
      // Moving down: decrement positions between old and new
      await this.supabase
        .from('appointment_queue')
        .update({ queue_position: this.supabase.rpc('decrement_position') })
        .gt('queue_position', oldPosition)
        .lte('queue_position', newPosition)
        .neq('id', id);
    }

    // Update current item
    const { data: updated, error } = await this.supabase
      .from('appointment_queue')
      .update({ queue_position: newPosition })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi di chuyển vị trí: ${error.message}`);
    }

    await this.invalidateQueueCache();

    return this.mapQueueFromDb(updated);
  }

  // ==================== REMOVE FROM QUEUE ====================

  async removeFromQueue(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('appointment_queue')
      .delete()
      .eq('id', id);

    if (error) {
      throw new BadRequestException(`Lỗi khi xóa khỏi hàng đợi: ${error.message}`);
    }

    await this.invalidateQueueCache();
    await this.reorderQueue();
  }

  // ==================== REORDER QUEUE ====================

  private async reorderQueue(): Promise<void> {
    const { data: items } = await this.supabase
      .from('appointment_queue')
      .select('id')
      .eq('status', QueueStatus.WAITING)
      .order('queue_position', { ascending: true });

    if (items) {
      for (let i = 0; i < items.length; i++) {
        await this.supabase
          .from('appointment_queue')
          .update({ queue_position: i + 1 })
          .eq('id', items[i].id);
      }
    }
  }

  // ==================== HELPER METHODS ====================

  private mapQueueFromDb(data: any): AppointmentQueue {
    return {
      id: data.id,
      appointmentId: data.appointment_id,
      queuePosition: data.queue_position,
      estimatedStartTime: data.estimated_start_time ? new Date(data.estimated_start_time) : undefined,
      estimatedWaitMinutes: data.estimated_wait_minutes,
      status: data.status as QueueStatus,
      notified: data.notified,
      notifiedAt: data.notified_at ? new Date(data.notified_at) : undefined,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  private async invalidateQueueCache(): Promise<void> {
    const client = this.redisService.getClient();
    const keys = await client.keys('queue:*');
    if (keys.length > 0) {
      await client.del(...keys);
    }
  }
}