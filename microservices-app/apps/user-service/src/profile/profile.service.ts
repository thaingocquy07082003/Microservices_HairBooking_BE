import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { RedisService } from '@app/redis';
import { Role } from '@app/common';
import { UpdateProfileDto, UpdateProfileByAdminDto, GetProfilesFilterDto } from './dto/profile.dto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: string;
  verified: boolean;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ProfilesService {
  private supabase: SupabaseClient;
  
  // Cache TTL
  private readonly CACHE_TTL = {
    PROFILE: 3600,      // 1 hour
    LIST: 600,          // 10 minutes
  };

  // Cache keys
  private readonly CACHE_KEYS = {
    profile: (id: string) => `profile:${id}`,
    profilesList: (filter: string) => `profiles:list:${filter}`,
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

  // ==================== PROFILE METHODS ====================

  /**
   * Lấy profile theo ID
   */
  async getProfileById(id: string): Promise<Profile> {
    // Try cache first
    const cacheKey = this.CACHE_KEYS.profile(id);
    const cached = await this.redisService.get<Profile>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Không tìm thấy profile với ID: ${id}`);
    }

    const profile = this.mapProfileFromDb(data);

    // Cache result
    await this.redisService.set(cacheKey, profile, this.CACHE_TTL.PROFILE);

    return profile;
  }

  /**
   * Lấy profile theo email
   */
  async getProfileByEmail(email: string): Promise<Profile> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Không tìm thấy profile với email: ${email}`);
    }

    return this.mapProfileFromDb(data);
  }

  /**
   * Lấy tất cả profiles với filter (chỉ dành cho Admin/Manager)
   */
  async getAllProfiles(filter: GetProfilesFilterDto): Promise<{
    data: Profile[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    // Create cache key based on filter
    const filterKey = JSON.stringify(filter);
    const cacheKey = this.CACHE_KEYS.profilesList(filterKey);
    
    // Try cache first
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    // Build query
    let query = this.supabase
      .from('profiles')
      .select('*', { count: 'exact' });

    // Apply filters
    if (filter.role) {
      query = query.eq('role', filter.role);
    }
    if (filter.verified !== undefined) {
      query = query.eq('verified', filter.verified);
    }
    if (filter.search) {
      query = query.or(`email.ilike.%${filter.search}%,full_name.ilike.%${filter.search}%`);
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
      throw new BadRequestException(`Lỗi khi lấy danh sách profiles: ${error.message}`);
    }

    const profiles = (data || []).map(p => this.mapProfileFromDb(p));

    const result = {
      data: profiles,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };

    // Cache result
    await this.redisService.set(cacheKey, result, this.CACHE_TTL.LIST);

    return result;
  }

  /**
   * Cập nhật profile của chính mình (User tự cập nhật)
   */
  async updateOwnProfile(userId: string, dto: UpdateProfileDto): Promise<Profile> {
    // Verify profile exists
    await this.getProfileById(userId);

    // Build update data (chỉ cho phép update những field an toàn)
    const updateData: any = {};
    if (dto.fullName) updateData.full_name = dto.fullName;
    if (dto.phone !== undefined) updateData.phone = dto.phone;
    if (dto.avatarUrl !== undefined) updateData.avatar_url = dto.avatarUrl;

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('Không có dữ liệu để cập nhật');
    }

    // Update profile
    const { data: profile, error } = await this.supabase
      .from('profiles')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi cập nhật profile: ${error.message}`);
    }

    // Invalidate cache
    await this.invalidateProfileCache(userId);

    return this.mapProfileFromDb(profile);
  }

  /**
   * Cập nhật profile bởi Admin/Manager (có thêm quyền update email, role, verified)
   */
  async updateProfileByAdmin(
    targetUserId: string, 
    dto: UpdateProfileByAdminDto,
    currentUserRole: Role
  ): Promise<Profile> {
    // Verify profile exists
    const targetProfile = await this.getProfileById(targetUserId);

    // Build update data
    const updateData: any = {};
    if (dto.fullName) updateData.full_name = dto.fullName;
    if (dto.phone !== undefined) updateData.phone = dto.phone;
    if (dto.avatarUrl !== undefined) updateData.avatar_url = dto.avatarUrl;
    if (dto.email) updateData.email = dto.email;
    if (dto.verified !== undefined) updateData.verified = dto.verified;

    // Xử lý việc thay đổi role (có kiểm tra quyền)
    if (dto.role) {
      // SuperAdmin có thể thay đổi role bất kỳ
      if (currentUserRole === Role.SuperAdmin) {
        updateData.role = dto.role;
      }
      // Admin không thể thay đổi role thành SuperAdmin
      else if (currentUserRole === Role.Admin) {
        if (dto.role === Role.SuperAdmin) {
          throw new ForbiddenException('Admin không thể gán role SuperAdmin');
        }
        if (targetProfile.role === Role.SuperAdmin) {
          throw new ForbiddenException('Admin không thể thay đổi role của SuperAdmin');
        }
        updateData.role = dto.role;
      }
      // Manager không thể thay đổi role
      else if (currentUserRole === Role.Manager) {
        throw new ForbiddenException('Manager không có quyền thay đổi role');
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('Không có dữ liệu để cập nhật');
    }

    // Update profile
    const { data: profile, error } = await this.supabase
      .from('profiles')
      .update(updateData)
      .eq('id', targetUserId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi cập nhật profile: ${error.message}`);
    }

    // Invalidate cache
    await this.invalidateProfileCache(targetUserId);
    await this.invalidateProfilesListCache();

    return this.mapProfileFromDb(profile);
  }

  /**
   * Xóa profile (soft delete - set role về customer và verified = false)
   * Chỉ SuperAdmin mới có quyền xóa hoàn toàn
   */
  async deleteProfile(userId: string, deletedBy: Role): Promise<void> {
    const profile = await this.getProfileById(userId);

    // Không cho phép xóa SuperAdmin trừ khi người xóa cũng là SuperAdmin
    if (profile.role === Role.SuperAdmin && deletedBy !== Role.SuperAdmin) {
      throw new ForbiddenException('Không thể xóa profile của SuperAdmin');
    }

    // SuperAdmin có thể xóa hẳn
    if (deletedBy === Role.SuperAdmin) {
      const { error } = await this.supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (error) {
        throw new BadRequestException(`Lỗi khi xóa profile: ${error.message}`);
      }
    } else {
      // Soft delete: reset về customer và chưa verified
      const { error } = await this.supabase
        .from('profiles')
        .update({ 
          role: Role.Customer,
          verified: false
        })
        .eq('id', userId);

      if (error) {
        throw new BadRequestException(`Lỗi khi xóa profile: ${error.message}`);
      }
    }

    // Invalidate cache
    await this.invalidateProfileCache(userId);
    await this.invalidateProfilesListCache();
  }

  // ==================== HELPER METHODS ====================

  private mapProfileFromDb(data: any): Profile {
    return {
      id: data.id,
      email: data.email,
      fullName: data.full_name,
      phone: data.phone,
      role: data.role,
      verified: data.verified,
      avatarUrl: data.avatar_url,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  // Cache invalidation methods
  private async invalidateProfileCache(id: string): Promise<void> {
    await this.redisService.delete(this.CACHE_KEYS.profile(id));
  }

  private async invalidateProfilesListCache(): Promise<void> {
    // Delete all list caches (pattern matching)
    const client = this.redisService.getClient();
    const keys = await client.keys('profiles:list:*');
    if (keys.length > 0) {
      await client.del(...keys);
    }
  }
}