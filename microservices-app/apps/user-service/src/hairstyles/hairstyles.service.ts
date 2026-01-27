// apps/user-service/src/hairstyles/hairstyles.service.ts

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { RedisService } from '@app/redis';
import { Hairstyle, Stylist } from '@app/common';
import { CreateHairstyleDto, UpdateHairstyleDto, FilterHairstyleDto, CreateStylistDto, UpdateStylistDto } from './dto/hairstyles.dto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HairstylesService {
  private supabase: SupabaseClient;
  
  // Cache TTL
  private readonly CACHE_TTL = {
    HAIRSTYLE: 3600,      // 1 hour
    STYLIST: 3600,        // 1 hour
    LIST: 600,            // 10 minutes
  };

  // Cache keys
  private readonly CACHE_KEYS = {
    hairstyle: (id: string) => `hairstyle:${id}`,
    hairstylesList: (filter: string) => `hairstyles:list:${filter}`,
    stylist: (id: string) => `stylist:${id}`,
    stylistsList: () => `stylists:list`,
    hairstylesByStylist: (stylistId: string) => `hairstyles:stylist:${stylistId}`,
  };

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    // Initialize Supabase client
    this.supabase = createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_SERVICE_KEY'),
    );
  }

  // ==================== HAIRSTYLE METHODS ====================

  async createHairstyle(dto: CreateHairstyleDto): Promise<Hairstyle> {
    // Validate stylists exist
    for (const stylistId of dto.stylistIds) {
      const stylist = await this.getStylistById(stylistId);
      if (!stylist) {
        throw new BadRequestException(`Không tìm thấy thợ cắt tóc với ID: ${stylistId}`);
      }
    }

    // Insert hairstyle to Supabase
    const { data: hairstyle, error } = await this.supabase
      .from('hairstyles')
      .insert({
        name: dto.name,
        description: dto.description,
        price: dto.price,
        duration: dto.duration,
        image_url: dto.imageUrl,
        category: dto.category,
        difficulty: dto.difficulty,
        is_active: dto.isActive ?? true,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi tạo kiểu tóc: ${error.message}`);
    }

    // Link hairstyle with stylists
    const links = dto.stylistIds.map(stylistId => ({
      hairstyle_id: hairstyle.id,
      stylist_id: stylistId,
    }));

    const { error: linkError } = await this.supabase
      .from('hairstyle_stylists')
      .insert(links);

    if (linkError) {
      // Rollback: delete hairstyle if linking fails
      await this.supabase.from('hairstyles').delete().eq('id', hairstyle.id);
      throw new BadRequestException(`Lỗi khi liên kết thợ cắt tóc: ${linkError.message}`);
    }

    // Invalidate cache
    await this.invalidateHairstylesCache();
    
    // Convert snake_case to camelCase
    return this.mapHairstyleFromDb(hairstyle, dto.stylistIds);
  }

  async getHairstyleById(id: string): Promise<Hairstyle> {
    // Try cache first
    const cacheKey = this.CACHE_KEYS.hairstyle(id);
    const cached = await this.redisService.get<Hairstyle>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from database with stylists
    const { data, error } = await this.supabase
      .from('hairstyles')
      .select(`
        *,
        hairstyle_stylists (
          stylist_id
        )
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Không tìm thấy kiểu tóc với ID: ${id}`);
    }

    const stylistIds = data.hairstyle_stylists?.map(hs => hs.stylist_id) || [];
    const hairstyle = this.mapHairstyleFromDb(data, stylistIds);

    // Cache result
    await this.redisService.set(cacheKey, hairstyle, this.CACHE_TTL.HAIRSTYLE);

    return hairstyle;
  }

  async getAllHairstyles(filter: FilterHairstyleDto): Promise<{
    data: Hairstyle[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    // Create cache key based on filter
    const filterKey = JSON.stringify(filter);
    const cacheKey = this.CACHE_KEYS.hairstylesList(filterKey);
    
    // Try cache first
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    // Build query
    let query = this.supabase
      .from('hairstyles')
      .select(`
        *,
        hairstyle_stylists (
          stylist_id
        )
      `, { count: 'exact' });

    // Apply filters
    if (filter.isActive !== undefined) {
      query = query.eq('is_active', filter.isActive);
    }
    if (filter.category) {
      query = query.eq('category', filter.category);
    }
    if (filter.minPrice !== undefined) {
      query = query.gte('price', filter.minPrice);
    }
    if (filter.maxPrice !== undefined) {
      query = query.lte('price', filter.maxPrice);
    }
    if (filter.difficulty) {
      query = query.eq('difficulty', filter.difficulty);
    }
    if (filter.search) {
      query = query.or(`name.ilike.%${filter.search}%,description.ilike.%${filter.search}%`);
    }

    // Filter by stylist (requires subquery)
    if (filter.stylistId) {
      const { data: hairstyleIds } = await this.supabase
        .from('hairstyle_stylists')
        .select('hairstyle_id')
        .eq('stylist_id', filter.stylistId);
      
      const ids = hairstyleIds?.map(h => h.hairstyle_id) || [];
      if (ids.length > 0) {
        query = query.in('id', ids);
      } else {
        return { data: [], total: 0, page: filter.page || 1, limit: filter.limit || 10, totalPages: 0 };
      }
    }

    // Sorting
    const sortBy = filter.sortBy || 'created_at';
    const order = filter.order || 'desc';
    query = query.order(sortBy === 'createdAt' ? 'created_at' : sortBy, { ascending: order === 'asc' });

    // Pagination
    const page = filter.page || 1;
    const limit = filter.limit || 10;
    const offset = (page - 1) * limit;
    
    query = query.range(offset, offset + limit - 1);

    // Execute query
    const { data, count, error } = await query;

    if (error) {
      throw new BadRequestException(`Lỗi khi lấy danh sách kiểu tóc: ${error.message}`);
    }

    const hairstyles = (data || []).map(h => 
      this.mapHairstyleFromDb(h, h.hairstyle_stylists?.map(hs => hs.stylist_id) || [])
    );

    const result = {
      data: hairstyles,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };

    // Cache result
    await this.redisService.set(cacheKey, result, this.CACHE_TTL.LIST);

    return result;
  }

  async getHairstylesByStylist(stylistId: string): Promise<Hairstyle[]> {
    // Verify stylist exists
    await this.getStylistById(stylistId);

    // Try cache first
    const cacheKey = this.CACHE_KEYS.hairstylesByStylist(stylistId);
    const cached = await this.redisService.get<Hairstyle[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Get hairstyle IDs for this stylist
    const { data: links, error: linkError } = await this.supabase
      .from('hairstyle_stylists')
      .select('hairstyle_id')
      .eq('stylist_id', stylistId);

    if (linkError) {
      throw new BadRequestException(`Lỗi khi lấy kiểu tóc: ${linkError.message}`);
    }

    const hairstyleIds = links?.map(l => l.hairstyle_id) || [];
    
    if (hairstyleIds.length === 0) {
      return [];
    }

    // Fetch hairstyles
    const { data, error } = await this.supabase
      .from('hairstyles')
      .select(`
        *,
        hairstyle_stylists (
          stylist_id
        )
      `)
      .in('id', hairstyleIds)
      .eq('is_active', true)
      .order('price', { ascending: true });

    if (error) {
      throw new BadRequestException(`Lỗi khi lấy kiểu tóc: ${error.message}`);
    }

    const hairstyles = (data || []).map(h => 
      this.mapHairstyleFromDb(h, h.hairstyle_stylists?.map(hs => hs.stylist_id) || [])
    );

    // Cache result
    await this.redisService.set(cacheKey, hairstyles, this.CACHE_TTL.LIST);

    return hairstyles;
  }

  async updateHairstyle(id: string, dto: UpdateHairstyleDto): Promise<Hairstyle> {
    // Verify hairstyle exists
    await this.getHairstyleById(id);

    // Validate new stylists if provided
    if (dto.stylistIds) {
      for (const stylistId of dto.stylistIds) {
        const stylist = await this.getStylistById(stylistId);
        if (!stylist) {
          throw new BadRequestException(`Không tìm thấy thợ cắt tóc với ID: ${stylistId}`);
        }
      }
    }

    // Update hairstyle
    const updateData: any = {};
    if (dto.name) updateData.name = dto.name;
    if (dto.description) updateData.description = dto.description;
    if (dto.price !== undefined) updateData.price = dto.price;
    if (dto.duration !== undefined) updateData.duration = dto.duration;
    if (dto.imageUrl) updateData.image_url = dto.imageUrl;
    if (dto.category) updateData.category = dto.category;
    if (dto.difficulty) updateData.difficulty = dto.difficulty;
    if (dto.isActive !== undefined) updateData.is_active = dto.isActive;

    const { data: hairstyle, error } = await this.supabase
      .from('hairstyles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi cập nhật kiểu tóc: ${error.message}`);
    }

    // Update stylist links if provided
    if (dto.stylistIds) {
      // Delete old links
      await this.supabase
        .from('hairstyle_stylists')
        .delete()
        .eq('hairstyle_id', id);

      // Insert new links
      const links = dto.stylistIds.map(stylistId => ({
        hairstyle_id: id,
        stylist_id: stylistId,
      }));

      await this.supabase
        .from('hairstyle_stylists')
        .insert(links);
    }

    // Invalidate cache
    await this.invalidateHairstyleCache(id);
    await this.invalidateHairstylesCache();

    // Get updated hairstyle with stylists
    return this.getHairstyleById(id);
  }

  async deleteHairstyle(id: string): Promise<void> {
    // Soft delete: set is_active = false
    const { error } = await this.supabase
      .from('hairstyles')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      throw new BadRequestException(`Lỗi khi xóa kiểu tóc: ${error.message}`);
    }

    // Invalidate cache
    await this.invalidateHairstyleCache(id);
    await this.invalidateHairstylesCache();
  }

  // ==================== STYLIST METHODS ====================

  async createStylist(dto: CreateStylistDto): Promise<Stylist> {
    // Check if user exists and is a stylist
    const { data: user, error: userError } = await this.supabase
      .from('users')
      .select('id, role')
      .eq('id', dto.userId)
      .single();

    if (userError || !user) {
      throw new BadRequestException(`Không tìm thấy người dùng với ID: ${dto.userId}`);
    }

    // Insert stylist
    const { data: stylist, error } = await this.supabase
      .from('stylists')
      .insert({
        user_id: dto.userId,
        full_name: dto.fullName,
        avatar_url: dto.avatarUrl,
        experience: dto.experience,
        specialties: dto.specialties,
        rating: 0,
        total_bookings: 0,
        is_available: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // Unique violation
        throw new BadRequestException('Người dùng này đã là thợ cắt tóc');
      }
      throw new BadRequestException(`Lỗi khi tạo thợ cắt tóc: ${error.message}`);
    }

    // Invalidate cache
    await this.invalidateStylistsCache();

    return this.mapStylistFromDb(stylist);
  }

  async getStylistById(id: string): Promise<Stylist> {
    // Try cache first
    const cacheKey = this.CACHE_KEYS.stylist(id);
    const cached = await this.redisService.get<Stylist>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const { data, error } = await this.supabase
      .from('stylists')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Không tìm thấy thợ cắt tóc với ID: ${id}`);
    }

    const stylist = this.mapStylistFromDb(data);

    // Cache result
    await this.redisService.set(cacheKey, stylist, this.CACHE_TTL.STYLIST);

    return stylist;
  }

  async getAllStylists(): Promise<Stylist[]> {
    // Try cache first
    const cacheKey = this.CACHE_KEYS.stylistsList();
    const cached = await this.redisService.get<Stylist[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const { data, error } = await this.supabase
      .from('stylists')
      .select('*')
      .eq('is_available', true)
      .order('rating', { ascending: false });

    if (error) {
      throw new BadRequestException(`Lỗi khi lấy danh sách thợ cắt tóc: ${error.message}`);
    }

    const stylists = (data || []).map(s => this.mapStylistFromDb(s));

    // Cache result
    await this.redisService.set(cacheKey, stylists, this.CACHE_TTL.LIST);

    return stylists;
  }

  async updateStylist(id: string, dto: UpdateStylistDto): Promise<Stylist> {
    // Verify stylist exists
    await this.getStylistById(id);

    // Update stylist
    const updateData: any = {};
    if (dto.fullName) updateData.full_name = dto.fullName;
    if (dto.avatarUrl !== undefined) updateData.avatar_url = dto.avatarUrl;
    if (dto.experience !== undefined) updateData.experience = dto.experience;
    if (dto.specialties) updateData.specialties = dto.specialties;
    if (dto.isAvailable !== undefined) updateData.is_available = dto.isAvailable;

    const { data: stylist, error } = await this.supabase
      .from('stylists')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi cập nhật thợ cắt tóc: ${error.message}`);
    }

    // Invalidate cache
    await this.invalidateStylistCache(id);
    await this.invalidateStylistsCache();

    return this.mapStylistFromDb(stylist);
  }

  async deleteStylist(id: string): Promise<void> {
    // Soft delete: set is_available = false
    const { error } = await this.supabase
      .from('stylists')
      .update({ is_available: false })
      .eq('id', id);

    if (error) {
      throw new BadRequestException(`Lỗi khi xóa thợ cắt tóc: ${error.message}`);
    }

    // Invalidate cache
    await this.invalidateStylistCache(id);
    await this.invalidateStylistsCache();
  }

  // ==================== HELPER METHODS ====================

  private mapHairstyleFromDb(data: any, stylistIds: string[]): Hairstyle {
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      price: parseFloat(data.price),
      duration: data.duration,
      imageUrl: data.image_url,
      category: data.category,
      difficulty: data.difficulty,
      stylistIds: stylistIds,
      isActive: data.is_active,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  private mapStylistFromDb(data: any): Stylist {
    return {
      id: data.id,
      userId: data.user_id,
      fullName: data.full_name,
      avatarUrl: data.avatar_url,
      experience: data.experience,
      rating: parseFloat(data.rating || 0),
      totalBookings: data.total_bookings || 0,
      specialties: data.specialties || [],
      isAvailable: data.is_available,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  // Cache invalidation methods
  private async invalidateHairstyleCache(id: string): Promise<void> {
    await this.redisService.delete(this.CACHE_KEYS.hairstyle(id));
  }

  private async invalidateHairstylesCache(): Promise<void> {
    // Delete all list caches (pattern matching)
    const client = this.redisService.getClient();
    const keys = await client.keys('hairstyles:list:*');
    if (keys.length > 0) {
      await client.del(...keys);
    }
    // Also invalidate hairstyles by stylist
    const stylistKeys = await client.keys('hairstyles:stylist:*');
    if (stylistKeys.length > 0) {
      await client.del(...stylistKeys);
    }
  }

  private async invalidateStylistCache(id: string): Promise<void> {
    await this.redisService.delete(this.CACHE_KEYS.stylist(id));
  }

  private async invalidateStylistsCache(): Promise<void> {
    await this.redisService.delete(this.CACHE_KEYS.stylistsList());
  }
}