// apps/user-service/src/hairstyles/hairstyles.service.ts

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { RedisService } from '@app/redis';
import { FileUploadService, Hairstyle, Stylist } from '@app/common';
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
    // Inject FileUploadService để upload ảnh lên Cloudinary
    private readonly fileUploadService: FileUploadService,
  ) {
    this.supabase = createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_SERVICE_KEY'),
    );
  }

  // ==================== HAIRSTYLE METHODS ====================

  /**
   * Tạo kiểu tóc mới.
   * @param file File ảnh từ multipart/form-data (field "image"). Nếu có, sẽ upload lên
   *             Cloudinary và dùng URL trả về. Nếu không có, dùng dto.imageUrl.
   *             Nếu cả hai đều thiếu → throw BadRequestException.
   */
  async createHairstyle(dto: CreateHairstyleDto, file?: Express.Multer.File): Promise<Hairstyle> {
    // Xác định imageUrl: ưu tiên file upload, fallback về dto.imageUrl
    let imageUrl = dto.imageUrl;
    if (file) {
      imageUrl = await this.fileUploadService.uploadImage(file);
    }
    if (!imageUrl) {
      throw new BadRequestException('Cần cung cấp ảnh kiểu tóc (file hoặc imageUrl)');
    }

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
        image_url: imageUrl,
        category: dto.category,
        difficulty: dto.difficulty,
        is_active: dto.isActive ?? true,
        category_id: dto.category_id,
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
    
    return this.mapHairstyleFromDb(hairstyle, dto.stylistIds);
  }

  async getHairstyleById(id: string): Promise<Hairstyle> {
    // Try cache first
    const cacheKey = this.CACHE_KEYS.hairstyle(id);
    const cached = await this.redisService.get<Hairstyle>(cacheKey);
    if (cached) {
      return cached;
    }

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
    const filterKey = JSON.stringify(filter);
    const cacheKey = this.CACHE_KEYS.hairstylesList(filterKey);
    
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    let query = this.supabase
      .from('hairstyles')
      .select(`
        *,
        hairstyle_stylists (
          stylist_id
        )
      `, { count: 'exact' });

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

    if (filter.stylistId) {
      const { data: hairstyleIds } = await this.supabase
        .from('hairstyle_stylists')
        .select('hairstyle_id')
        .eq('stylist_id', filter.stylistId);
      
      const ids = hairstyleIds?.map(h => h.hairstyle_id) || [];
      if (ids.length > 0) {
        query = query.in('id', ids);
      } else {
        return { data: [], total: 0, page: filter.page || 1, limit: filter.limit || 30, totalPages: 0 };
      }
    }

    const sortBy = filter.sortBy || 'created_at';
    const order = filter.order || 'desc';
    query = query.order(sortBy === 'createdAt' ? 'created_at' : sortBy, { ascending: order === 'asc' });

    const page = filter.page || 1;
    const limit = filter.limit || 30;
    const offset = (page - 1) * limit;
    
    query = query.range(offset, offset + limit - 1);

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

    await this.redisService.set(cacheKey, result, this.CACHE_TTL.LIST);

    return result;
  }

  async getStylistsByHairstyle(hairstyleId: string): Promise<Stylist[]> {
    await this.getHairstyleById(hairstyleId);
    const cacheKey = `stylists:hairstyle:${hairstyleId}`;
    const cached = await this.redisService.get<Stylist[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const { data: links, error: linkError } = await this.supabase
      .from('hairstyle_stylists')
      .select('stylist_id')
      .eq('hairstyle_id', hairstyleId);

    if (linkError) {
      throw new BadRequestException(`Lỗi khi lấy danh sách thợ cắt tóc: ${linkError.message}`);
    }

    const stylistIds = links?.map(l => l.stylist_id) || [];

    if (stylistIds.length === 0) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('stylists')
      .select('*')
      .in('id', stylistIds)
      .eq('is_available', true)
      .order('rating', { ascending: false });

    if (error) {
      throw new BadRequestException(`Lỗi khi lấy danh sách thợ cắt tóc: ${error.message}`);
    }

    const stylists = (data || []).map(s => this.mapStylistFromDb(s));

    await this.redisService.set(cacheKey, stylists, this.CACHE_TTL.LIST);

    return stylists;
  }

  async getHairstylesByStylist(stylistId: string): Promise<Hairstyle[]> {
    await this.getStylistById(stylistId);

    const cacheKey = this.CACHE_KEYS.hairstylesByStylist(stylistId);
    const cached = await this.redisService.get<Hairstyle[]>(cacheKey);
    if (cached) {
      return cached;
    }

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

    await this.redisService.set(cacheKey, hairstyles, this.CACHE_TTL.LIST);

    return hairstyles;
  }

  /**
   * Cập nhật kiểu tóc.
   * @param file File ảnh mới (tùy chọn). Nếu có → upload Cloudinary và thay thế imageUrl cũ.
   *            Nếu không có file và không truyền dto.imageUrl → giữ nguyên ảnh cũ.
   */
  async updateHairstyle(id: string, dto: UpdateHairstyleDto, file?: Express.Multer.File): Promise<Hairstyle> {
    await this.getHairstyleById(id);

    if (dto.stylistIds) {
      for (const stylistId of dto.stylistIds) {
        const stylist = await this.getStylistById(stylistId);
        if (!stylist) {
          throw new BadRequestException(`Không tìm thấy thợ cắt tóc với ID: ${stylistId}`);
        }
      }
    }

    // Upload ảnh mới nếu có file, ghi đè dto.imageUrl
    if (file) {
      dto.imageUrl = await this.fileUploadService.uploadImage(file);
    }

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.price !== undefined) updateData.price = dto.price;
    if (dto.duration !== undefined) updateData.duration = dto.duration;
    if (dto.imageUrl !== undefined) updateData.image_url = dto.imageUrl;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.difficulty !== undefined) updateData.difficulty = dto.difficulty;
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

    if (dto.stylistIds) {
      await this.supabase
        .from('hairstyle_stylists')
        .delete()
        .eq('hairstyle_id', id);

      const links = dto.stylistIds.map(stylistId => ({
        hairstyle_id: id,
        stylist_id: stylistId,
      }));

      await this.supabase
        .from('hairstyle_stylists')
        .insert(links);
    }

    await this.invalidateHairstyleCache(id);
    await this.invalidateHairstylesCache();

    return this.getHairstyleById(id);
  }

  async deleteHairstyle(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('hairstyles')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      throw new BadRequestException(`Lỗi khi xóa kiểu tóc: ${error.message}`);
    }

    await this.invalidateHairstyleCache(id);
    await this.invalidateHairstylesCache();
  }

  // ==================== STYLIST METHODS ====================

  /**
   * Tạo thợ cắt tóc mới.
   * @param file File avatar từ multipart/form-data (tùy chọn).
   *            Nếu có → upload Cloudinary. Nếu không → dùng dto.avatarUrl (có thể null).
   */
  async createStylist(dto: CreateStylistDto, file?: Express.Multer.File): Promise<Stylist> {
    // Upload avatar nếu có file
    let avatarUrl = dto.avatarUrl;
    if (file) {
      avatarUrl = await this.fileUploadService.uploadImage(file);
    }

    const { data: user, error: userError } = await this.supabase
      .from('users')
      .select('id, role')
      .eq('id', dto.userId)
      .single();

    if (userError || !user) {
      throw new BadRequestException(`Không tìm thấy người dùng với ID: ${dto.userId}`);
    }

    const { data: stylist, error } = await this.supabase
      .from('stylists')
      .insert({
        user_id: dto.userId,
        full_name: dto.fullName,
        avatar_url: avatarUrl ?? null,
        experience: dto.experience,
        specialties: dto.specialties,
        rating: 0,
        total_bookings: 0,
        is_available: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new BadRequestException('Người dùng này đã là thợ cắt tóc');
      }
      throw new BadRequestException(`Lỗi khi tạo thợ cắt tóc: ${error.message}`);
    }

    await this.invalidateStylistsCache();

    return this.mapStylistFromDb(stylist);
  }

  async getStylistById(id: string): Promise<Stylist> {
    const cacheKey = this.CACHE_KEYS.stylist(id);
    const cached = await this.redisService.get<Stylist>(cacheKey);
    if (cached) {
      return cached;
    }

    const { data, error } = await this.supabase
      .from('stylists')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Không tìm thấy thợ cắt tóc với ID: ${id}`);
    }

    const stylist = this.mapStylistFromDb(data);

    await this.redisService.set(cacheKey, stylist, this.CACHE_TTL.STYLIST);

    return stylist;
  }

  async getAllStylists(): Promise<Stylist[]> {
    const cacheKey = this.CACHE_KEYS.stylistsList();
    const cached = await this.redisService.get<Stylist[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const { data, error } = await this.supabase
      .from('stylists')
      .select('*')
      .eq('is_available', true)
      .order('rating', { ascending: false });

    if (error) {
      throw new BadRequestException(`Lỗi khi lấy danh sách thợ cắt tóc: ${error.message}`);
    }

    const stylists = (data || []).map(s => this.mapStylistFromDb(s));

    await this.redisService.set(cacheKey, stylists, this.CACHE_TTL.LIST);

    return stylists;
  }

  /**
   * Cập nhật thông tin thợ cắt tóc.
   * @param file File avatar mới (tùy chọn). Nếu có → upload Cloudinary và thay thế avatar cũ.
   */
  async updateStylist(id: string, dto: UpdateStylistDto, file?: Express.Multer.File): Promise<Stylist> {
    await this.getStylistById(id);

    // Upload avatar mới nếu có file
    if (file) {
      dto.avatarUrl = await this.fileUploadService.uploadImage(file);
    }

    const updateData: any = {};
    if (dto.fullName !== undefined) updateData.full_name = dto.fullName;
    if (dto.avatarUrl !== undefined) updateData.avatar_url = dto.avatarUrl;
    if (dto.experience !== undefined) updateData.experience = dto.experience;
    if (dto.specialties !== undefined) updateData.specialties = dto.specialties;
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

    await this.invalidateStylistCache(id);
    await this.invalidateStylistsCache();

    return this.mapStylistFromDb(stylist);
  }

  async deleteStylist(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('stylists')
      .update({ is_available: false })
      .eq('id', id);

    if (error) {
      throw new BadRequestException(`Lỗi khi xóa thợ cắt tóc: ${error.message}`);
    }

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
    await this.redisService.delete(`stylists:hairstyle:${id}`);
  }

  private async invalidateHairstylesCache(): Promise<void> {
    const client = this.redisService.getClient();
    const keys = await client.keys('hairstyles:list:*');
    if (keys.length > 0) {
      await client.del(...keys);
    }
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