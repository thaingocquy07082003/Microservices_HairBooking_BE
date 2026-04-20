import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { RedisService } from '@app/redis';
import { NotificationGateway, Notification } from './notification.gateway';
import {
  CreateNotificationDto,
  UpdateNotificationDto,
  FilterNotificationDto,
} from './dto/notification.dto';

@Injectable()
export class NotificationService {
  private supabase: SupabaseClient;

  private readonly TTL = { LIST: 300, ITEM: 600 }; // seconds

  private readonly KEYS = {
    item: (id: string) => `notification:${id}`,
    list: (f: string) => `notifications:list:${f}`,
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly gateway: NotificationGateway,
  ) {
    this.supabase = createClient(
      this.configService.getOrThrow('SUPABASE_URL'),
      this.configService.getOrThrow('SUPABASE_SERVICE_KEY'),
    );
  }

  // ── CREATE ──────────────────────────────────────────────

  async create(dto: CreateNotificationDto): Promise<Notification> {
    const { data, error } = await this.supabase
      .from('notifications')
      .insert({ title: dto.title, content: dto.content })
      .select()
      .single();

    if (error) throw new BadRequestException(`Lỗi khi tạo thông báo: ${error.message}`);

    const notification = this.map(data);

    await this.invalidateList();

    // Broadcast realtime
    this.gateway.broadcastNew(notification);

    return notification;
  }

  // ── READ ALL ─────────────────────────────────────────────

  async findAll(filter: FilterNotificationDto): Promise<{
    data: Notification[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const cacheKey = this.KEYS.list(JSON.stringify(filter));
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) return cached;

    let query = this.supabase
      .from('notifications')
      .select('*', { count: 'exact' });

    if (filter.search) {
      query = query.or(
        `title.ilike.%${filter.search}%,content.ilike.%${filter.search}%`,
      );
    }

    const order = filter.order ?? 'desc';
    query = query.order('created_at', { ascending: order === 'asc' });

    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    query = query.range((page - 1) * limit, page * limit - 1);

    const { data, count, error } = await query;
    if (error) throw new BadRequestException(`Lỗi khi lấy thông báo: ${error.message}`);

    const result = {
      data: (data ?? []).map(this.map),
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    };

    await this.redisService.set(cacheKey, result, this.TTL.LIST);
    return result;
  }

  // ── READ ONE ─────────────────────────────────────────────

  async findOne(id: string): Promise<Notification> {
    const cacheKey = this.KEYS.item(id);
    const cached = await this.redisService.get<Notification>(cacheKey);
    if (cached) return cached;

    const { data, error } = await this.supabase
      .from('notifications')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data)
      throw new NotFoundException(`Không tìm thấy thông báo với ID: ${id}`);

    const notification = this.map(data);
    await this.redisService.set(cacheKey, notification, this.TTL.ITEM);
    return notification;
  }

  // ── UPDATE ───────────────────────────────────────────────

  async update(id: string, dto: UpdateNotificationDto): Promise<Notification> {
    await this.findOne(id); // ensure exists

    const updateData: any = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.content !== undefined) updateData.content = dto.content;

    if (!Object.keys(updateData).length)
      throw new BadRequestException('Không có dữ liệu để cập nhật');

    const { data, error } = await this.supabase
      .from('notifications')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new BadRequestException(`Lỗi khi cập nhật: ${error.message}`);

    const notification = this.map(data);

    await this.redisService.delete(this.KEYS.item(id));
    await this.invalidateList();

    // Broadcast realtime
    this.gateway.broadcastUpdated(notification);

    return notification;
  }

  // ── DELETE ───────────────────────────────────────────────

  async remove(id: string): Promise<void> {
    await this.findOne(id); // ensure exists

    const { error } = await this.supabase
      .from('notifications')
      .delete()
      .eq('id', id);

    if (error) throw new BadRequestException(`Lỗi khi xóa: ${error.message}`);

    await this.redisService.delete(this.KEYS.item(id));
    await this.invalidateList();

    // Broadcast realtime
    this.gateway.broadcastDeleted(id);
  }

  // ── HELPERS ──────────────────────────────────────────────

  private map = (data: any): Notification => ({
    id: data.id,
    title: data.title,
    content: data.content,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  });

  private async invalidateList(): Promise<void> {
    const client = this.redisService.getClient();
    const keys = await client.keys('notifications:list:*');
    if (keys.length) await client.del(...keys);
  }
}