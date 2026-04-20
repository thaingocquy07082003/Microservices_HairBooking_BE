// booking-service/src/services/service.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { RedisService } from '@app/redis';
import { Service } from '@app/common/entities/service.entity';
import {
  CreateServiceDto,
  UpdateServiceDto,
  FilterServiceDto,
} from './dto/service.dto';

@Injectable()
export class ServiceService {
  private supabase: SupabaseClient;

  private readonly CACHE_TTL = {
    SERVICE: 1800, // 30 phút
    LIST: 600,     // 10 phút
  };

  private readonly CACHE_KEYS = {
    service: (id: string) => `service:${id}`,
    list: (filter: string) => `services:list:${filter}`,
    publicList: (filter: string) => `services:public:${filter}`,
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.supabase = createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_SERVICE_KEY'),
    );
  }

  // ==================== [ADMIN] TẠO DỊCH VỤ ====================

  async createService(dto: CreateServiceDto): Promise<Service> {
    const { data, error } = await this.supabase
      .from('services')
      .insert({
        name: dto.name,
        description: dto.description ?? null,
        price: dto.price,
        duration: dto.duration,
        category: dto.category ?? null,
        image_url: dto.imageUrl ?? null,
        is_available: true,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi tạo dịch vụ: ${error.message}`);
    }

    await this.invalidateListCaches();

    return this.mapServiceFromDb(data);
  }

  // ==================== [ADMIN] CẬP NHẬT DỊCH VỤ ====================

  async updateService(id: string, dto: UpdateServiceDto): Promise<Service> {
    // Kiểm tra dịch vụ tồn tại (kể cả đã bị xóa mềm)
    await this.getServiceByIdInternal(id);

    const updateData: Record<string, any> = {};
    if (dto.name !== undefined)        updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.price !== undefined)       updateData.price = dto.price;
    if (dto.duration !== undefined)    updateData.duration = dto.duration;
    if (dto.category !== undefined)    updateData.category = dto.category;
    if (dto.imageUrl !== undefined)    updateData.image_url = dto.imageUrl;

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('Không có dữ liệu để cập nhật');
    }

    const { data, error } = await this.supabase
      .from('services')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi cập nhật dịch vụ: ${error.message}`);
    }

    await this.invalidateServiceCache(id);
    await this.invalidateListCaches();

    return this.mapServiceFromDb(data);
  }

  // ==================== [ADMIN] XÓA MỀM DỊCH VỤ ====================
  // Đặt is_available = false thay vì xóa thật sự

  async softDeleteService(id: string): Promise<Service> {
    // Kiểm tra tồn tại
    const existing = await this.getServiceByIdInternal(id);

    if (!existing.isAvailable) {
      throw new BadRequestException('Dịch vụ này đã bị xóa trước đó');
    }

    const { data, error } = await this.supabase
      .from('services')
      .update({ is_available: false })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi xóa dịch vụ: ${error.message}`);
    }

    await this.invalidateServiceCache(id);
    await this.invalidateListCaches();

    return this.mapServiceFromDb(data);
  }

  // ==================== [ADMIN] KHÔI PHỤC DỊCH VỤ ====================
  // Tiện ích để admin restore dịch vụ bị xóa mềm

  async restoreService(id: string): Promise<Service> {
    const existing = await this.getServiceByIdInternal(id);

    if (existing.isAvailable) {
      throw new BadRequestException('Dịch vụ này đang hoạt động, không cần khôi phục');
    }

    const { data, error } = await this.supabase
      .from('services')
      .update({ is_available: true })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi khôi phục dịch vụ: ${error.message}`);
    }

    await this.invalidateServiceCache(id);
    await this.invalidateListCaches();

    return this.mapServiceFromDb(data);
  }

  // ==================== [PUBLIC] XEM DỊCH VỤ ĐANG HOẠT ĐỘNG ====================
  // Chỉ trả về các dịch vụ có is_available = true

  async getAvailableServices(filter: FilterServiceDto): Promise<{
    data: Service[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const cacheKey = this.CACHE_KEYS.publicList(JSON.stringify(filter));
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) return cached;

    let query = this.supabase
      .from('services')
      .select('*', { count: 'exact' })
      .eq('is_available', true); // Chỉ lấy dịch vụ available

    query = this.applyFilters(query, filter);

    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    query = query.range((page - 1) * limit, page * limit - 1);

    const { data, count, error } = await query;

    if (error) {
      throw new BadRequestException(`Lỗi khi lấy danh sách dịch vụ: ${error.message}`);
    }

    const result = {
      data: (data ?? []).map(s => this.mapServiceFromDb(s)),
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    };

    await this.redisService.set(cacheKey, result, this.CACHE_TTL.LIST);
    return result;
  }

  // ==================== [ADMIN] XEM TẤT CẢ DỊCH VỤ (kể cả đã xóa mềm) ====================

  async getAllServicesAdmin(filter: FilterServiceDto): Promise<{
    data: Service[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const cacheKey = this.CACHE_KEYS.list(JSON.stringify(filter));
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) return cached;

    let query = this.supabase
      .from('services')
      .select('*', { count: 'exact' }); // Không filter is_available

    query = this.applyFilters(query, filter);

    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    query = query.range((page - 1) * limit, page * limit - 1);

    const { data, count, error } = await query;

    if (error) {
      throw new BadRequestException(`Lỗi khi lấy danh sách dịch vụ: ${error.message}`);
    }

    const result = {
      data: (data ?? []).map(s => this.mapServiceFromDb(s)),
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    };

    await this.redisService.set(cacheKey, result, this.CACHE_TTL.LIST);
    return result;
  }

  // ==================== XEM CHI TIẾT DỊCH VỤ ====================

  async getServiceById(id: string): Promise<Service> {
    const cacheKey = this.CACHE_KEYS.service(id);
    const cached = await this.redisService.get<Service>(cacheKey);
    if (cached) return cached;

    const { data, error } = await this.supabase
      .from('services')
      .select('*')
      .eq('id', id)
      .eq('is_available', true) // Public chỉ xem được available
      .single();

    if (error || !data) {
      throw new NotFoundException(`Không tìm thấy dịch vụ với ID: ${id}`);
    }

    const service = this.mapServiceFromDb(data);
    await this.redisService.set(cacheKey, service, this.CACHE_TTL.SERVICE);
    return service;
  }

  // ==================== HELPER INTERNAL ====================

  // Dùng nội bộ (kể cả dịch vụ đã xóa mềm)
  private async getServiceByIdInternal(id: string): Promise<Service> {
    const { data, error } = await this.supabase
      .from('services')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Không tìm thấy dịch vụ với ID: ${id}`);
    }

    return this.mapServiceFromDb(data);
  }

  private applyFilters(query: any, filter: FilterServiceDto): any {
    if (filter.category) {
      query = query.eq('category', filter.category);
    }
    if (filter.search) {
      query = query.or(
        `name.ilike.%${filter.search}%,description.ilike.%${filter.search}%`,
      );
    }

    const sortBy = filter.sortBy ?? 'created_at';
    const order = filter.order ?? 'asc';
    const dbSortBy =
      sortBy === 'createdAt' ? 'created_at' :
      sortBy === 'updatedAt' ? 'updated_at' : sortBy;

    return query.order(dbSortBy, { ascending: order === 'asc' });
  }

  private mapServiceFromDb(d: any): Service {
    return {
      id: d.id,
      name: d.name,
      description: d.description,
      price: parseFloat(d.price),
      duration: d.duration,
      category: d.category,
      imageUrl: d.image_url,
      isAvailable: d.is_available,
      createdAt: new Date(d.created_at),
      updatedAt: new Date(d.updated_at),
    };
  }

  private async invalidateServiceCache(id: string): Promise<void> {
    await this.redisService.delete(this.CACHE_KEYS.service(id));
  }

  private async invalidateListCaches(): Promise<void> {
    const client = this.redisService.getClient();
    const keys = await client.keys('services:*');
    if (keys.length > 0) await client.del(...keys);
  }
}