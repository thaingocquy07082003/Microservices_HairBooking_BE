import { 
  Injectable, 
  NotFoundException, 
  BadRequestException, 
  ConflictException,
  ForbiddenException 
} from '@nestjs/common';
import { RedisService } from '@app/redis';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { Role } from '@app/common';
import {
  CreateBranchDto,
  UpdateBranchDto,
  FilterBranchDto,
  FindNearbyBranchesDto,
  AddStaffToBranchDto,
  UpdateBranchStaffDto,
  FilterBranchStaffDto,
  AssignBranchAdminDto,
  UpdateBranchAdminDto,
  GetBranchStatsDto,
} from './dto/branch.dto';
import {
  Branch,
  BranchWithDetails,
  BranchStaff,
  BranchStaffWithDetails,
  BranchAdmin,
  BranchAdminWithDetails,
  BranchStats,
  NearbyBranch,
} from '@app/common/entities/branch.entity';

@Injectable()
export class BranchesService {
  private supabase: SupabaseClient;
  
  // Cache TTL
  private readonly CACHE_TTL = {
    BRANCH: 7200,         // 2 hours
    BRANCH_LIST: 1800,    // 30 minutes
    BRANCH_STAFF: 3600,   // 1 hour
    BRANCH_STATS: 600,    // 10 minutes
  };

  // Cache keys
  private readonly CACHE_KEYS = {
    branch: (id: string) => `branch:${id}`,
    branchBySlug: (slug: string) => `branch:slug:${slug}`,
    branchByCode: (code: string) => `branch:code:${code}`,
    branchesList: (filter: string) => `branches:list:${filter}`,
    branchStaff: (branchId: string) => `branch:${branchId}:staff`,
    branchAdmins: (branchId: string) => `branch:${branchId}:admins`,
    branchStats: (branchId: string) => `branch:${branchId}:stats`,
    userBranches: (userId: string) => `user:${userId}:branches`,
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

  // ==================== BRANCH CRUD ====================

  async createBranch(dto: CreateBranchDto): Promise<Branch> {
    // Check if slug or code already exists
    const { data: existingSlug } = await this.supabase
      .from('branches')
      .select('id')
      .eq('slug', dto.slug)
      .single();

    if (existingSlug) {
      throw new ConflictException(`Chi nhánh với slug "${dto.slug}" đã tồn tại`);
    }

    const { data: existingCode } = await this.supabase
      .from('branches')
      .select('id')
      .eq('code', dto.code)
      .single();

    if (existingCode) {
      throw new ConflictException(`Chi nhánh với mã "${dto.code}" đã tồn tại`);
    }

    // Insert branch
    const { data: branch, error } = await this.supabase
      .from('branches')
      .insert({
        name: dto.name,
        slug: dto.slug,
        code: dto.code,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        ward: dto.ward,
        district: dto.district,
        city: dto.city,
        country: dto.country || 'Vietnam',
        postal_code: dto.postalCode,
        latitude: dto.latitude,
        longitude: dto.longitude,
        is_active: dto.isActive ?? true,
        is_primary: dto.isPrimary ?? false,
        opening_date: dto.openingDate,
        working_hours: dto.workingHours || {},
        image_url: dto.imageUrl,
        description: dto.description,
        amenities: dto.amenities || [],
        meta_title: dto.metaTitle,
        meta_description: dto.metaDescription,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi tạo chi nhánh: ${error.message}`);
    }

    // Invalidate cache
    await this.invalidateAllBranchCaches();

    return this.mapBranchFromDb(branch);
  }

  async getBranchById(id: string): Promise<BranchWithDetails> {
    // Try cache first
    const cacheKey = this.CACHE_KEYS.branch(id);
    const cached = await this.redisService.get<BranchWithDetails>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from database with details
    const { data, error } = await this.supabase
      .from('branches_with_details')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Không tìm thấy chi nhánh với ID: ${id}`);
    }

    const branch = this.mapBranchWithDetailsFromDb(data);

    // Cache result
    await this.redisService.set(cacheKey, branch, this.CACHE_TTL.BRANCH);

    return branch;
  }

  async getBranchBySlug(slug: string): Promise<BranchWithDetails> {
    // Try cache first
    const cacheKey = this.CACHE_KEYS.branchBySlug(slug);
    const cached = await this.redisService.get<BranchWithDetails>(cacheKey);
    if (cached) {
      return cached;
    }

    const { data, error } = await this.supabase
      .from('branches_with_details')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Không tìm thấy chi nhánh với slug: ${slug}`);
    }

    const branch = this.mapBranchWithDetailsFromDb(data);

    // Cache result
    await this.redisService.set(cacheKey, branch, this.CACHE_TTL.BRANCH);

    return branch;
  }

  async getAllBranches(filter: FilterBranchDto): Promise<{
    data: BranchWithDetails[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    // Create cache key
    const filterKey = JSON.stringify(filter);
    const cacheKey = this.CACHE_KEYS.branchesList(filterKey);
    
    // Try cache first
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    // Build query
    let query = this.supabase
      .from('branches_with_details')
      .select('*', { count: 'exact' });

    // Apply filters
    if (filter.isActive !== undefined) {
      query = query.eq('is_active', filter.isActive);
    }
    if (filter.city) {
      query = query.eq('city', filter.city);
    }
    if (filter.search) {
      query = query.or(
        `name.ilike.%${filter.search}%,code.ilike.%${filter.search}%,address.ilike.%${filter.search}%`
      );
    }

    // Sorting
    const sortBy = filter.sortBy || 'created_at';
    const order = filter.order || 'desc';
    const dbSortBy = sortBy === 'createdAt' ? 'created_at' : sortBy;
    
    query = query.order(dbSortBy, { ascending: order === 'asc' });

    // Pagination
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const offset = (page - 1) * limit;
    
    query = query.range(offset, offset + limit - 1);

    // Execute query
    const { data, count, error } = await query;

    if (error) {
      throw new BadRequestException(`Lỗi khi lấy danh sách chi nhánh: ${error.message}`);
    }

    const branches = (data || []).map(b => this.mapBranchWithDetailsFromDb(b));

    const result = {
      data: branches,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };

    // Cache result
    await this.redisService.set(cacheKey, result, this.CACHE_TTL.BRANCH_LIST);

    return result;
  }

  async getActiveBranches(): Promise<BranchWithDetails[]> {
    return (await this.getAllBranches({ isActive: true, limit: 100 })).data;
  }

  async updateBranch(id: string, dto: UpdateBranchDto): Promise<Branch> {
    // Verify branch exists
    await this.getBranchById(id);

    // Check uniqueness if changing slug or code
    if (dto.slug) {
      const { data: existing } = await this.supabase
        .from('branches')
        .select('id')
        .eq('slug', dto.slug)
        .neq('id', id)
        .single();

      if (existing) {
        throw new ConflictException(`Chi nhánh với slug "${dto.slug}" đã tồn tại`);
      }
    }

    if (dto.code) {
      const { data: existing } = await this.supabase
        .from('branches')
        .select('id')
        .eq('code', dto.code)
        .neq('id', id)
        .single();

      if (existing) {
        throw new ConflictException(`Chi nhánh với mã "${dto.code}" đã tồn tại`);
      }
    }

    // Build update data
    const updateData: any = {};
    Object.keys(dto).forEach(key => {
      if (dto[key] !== undefined) {
        // Convert camelCase to snake_case
        const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        updateData[snakeKey] = dto[key];
      }
    });

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('Không có dữ liệu để cập nhật');
    }

    // Update branch
    const { data: branch, error } = await this.supabase
      .from('branches')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi cập nhật chi nhánh: ${error.message}`);
    }

    // Invalidate cache
    await this.invalidateBranchCache(id);
    await this.invalidateAllBranchCaches();

    return this.mapBranchFromDb(branch);
  }

  async deleteBranch(id: string): Promise<void> {
    // Check if branch has staff
    const { data: staff } = await this.supabase
      .from('branch_staff')
      .select('id')
      .eq('branch_id', id)
      .eq('is_active', true)
      .limit(1);

    if (staff && staff.length > 0) {
      throw new BadRequestException(
        'Không thể xóa chi nhánh đang có nhân viên. Vui lòng chuyển nhân viên sang chi nhánh khác trước.'
      );
    }

    // Soft delete: set is_active = false
    const { error } = await this.supabase
      .from('branches')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      throw new BadRequestException(`Lỗi khi xóa chi nhánh: ${error.message}`);
    }

    // Invalidate cache
    await this.invalidateBranchCache(id);
    await this.invalidateAllBranchCaches();
  }

  // ==================== BRANCH STAFF MANAGEMENT ====================

  async addStaffToBranch(
    branchId: string, 
    dto: AddStaffToBranchDto
  ): Promise<BranchStaff> {
    // Verify branch exists
    await this.getBranchById(branchId);

    // Verify user exists and get their role
    const { data: profile } = await this.supabase
      .from('profiles')
      .select('id, role')
      .eq('id', dto.userId)
      .single();

    if (!profile) {
      throw new NotFoundException(`Không tìm thấy người dùng với ID: ${dto.userId}`);
    }

    // Check if user already assigned to this branch
    const { data: existing } = await this.supabase
      .from('branch_staff')
      .select('id')
      .eq('branch_id', branchId)
      .eq('user_id', dto.userId)
      .single();

    if (existing) {
      throw new ConflictException('Người dùng đã được phân công vào chi nhánh này');
    }

    // Insert staff assignment
    const { data: staff, error } = await this.supabase
      .from('branch_staff')
      .insert({
        branch_id: branchId,
        user_id: dto.userId,
        role: dto.role,
        is_primary_branch: dto.isPrimaryBranch ?? true,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi thêm nhân viên: ${error.message}`);
    }

    // Invalidate cache
    await this.invalidateBranchStaffCache(branchId);
    await this.invalidateUserBranchesCache(dto.userId);

    return this.mapBranchStaffFromDb(staff);
  }

  async getBranchStaff(
    branchId: string, 
    filter: FilterBranchStaffDto
  ): Promise<{
    data: BranchStaffWithDetails[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    // Verify branch exists
    await this.getBranchById(branchId);

    // Build query
    let query = this.supabase
      .from('branch_staff_with_details')
      .select('*', { count: 'exact' })
      .eq('branch_id', branchId);

    // Apply filters
    if (filter.role) {
      query = query.eq('role', filter.role);
    }
    if (filter.isActive !== undefined) {
      query = query.eq('is_active', filter.isActive);
    }
    if (filter.search) {
      query = query.or(
        `full_name.ilike.%${filter.search}%,email.ilike.%${filter.search}%`
      );
    }

    // Pagination
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const offset = (page - 1) * limit;
    
    query = query.range(offset, offset + limit - 1);

    // Execute query
    const { data, count, error } = await query;

    if (error) {
      throw new BadRequestException(`Lỗi khi lấy danh sách nhân viên: ${error.message}`);
    }

    const staff = (data || []).map(s => this.mapBranchStaffWithDetailsFromDb(s));

    return {
      data: staff,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };
  }

  async updateBranchStaff(
    branchId: string,
    staffId: string,
    dto: UpdateBranchStaffDto
  ): Promise<BranchStaff> {
    // Build update data
    const updateData: any = {};
    if (dto.role !== undefined) updateData.role = dto.role;
    if (dto.isActive !== undefined) updateData.is_active = dto.isActive;
    if (dto.isPrimaryBranch !== undefined) updateData.is_primary_branch = dto.isPrimaryBranch;

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('Không có dữ liệu để cập nhật');
    }

    // Update
    const { data: staff, error } = await this.supabase
      .from('branch_staff')
      .update(updateData)
      .eq('id', staffId)
      .eq('branch_id', branchId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi cập nhật nhân viên: ${error.message}`);
    }

    // Invalidate cache
    await this.invalidateBranchStaffCache(branchId);

    return this.mapBranchStaffFromDb(staff);
  }

  async removeStaffFromBranch(branchId: string, staffId: string): Promise<void> {
    // Soft delete: set is_active = false and left_at = now
    const { error } = await this.supabase
      .from('branch_staff')
      .update({ 
        is_active: false,
        left_at: new Date().toISOString(),
      })
      .eq('id', staffId)
      .eq('branch_id', branchId);

    if (error) {
      throw new BadRequestException(`Lỗi khi xóa nhân viên: ${error.message}`);
    }

    // Invalidate cache
    await this.invalidateBranchStaffCache(branchId);
  }

  // ==================== BRANCH ADMIN MANAGEMENT ====================

  async assignBranchAdmin(
    branchId: string,
    dto: AssignBranchAdminDto,
    assignedBy: string
  ): Promise<BranchAdmin> {
    // Verify branch exists
    await this.getBranchById(branchId);

    // Verify user exists and is admin/superadmin
    const { data: profile } = await this.supabase
      .from('profiles')
      .select('id, role')
      .eq('id', dto.userId)
      .single();

    if (!profile) {
      throw new NotFoundException(`Không tìm thấy người dùng với ID: ${dto.userId}`);
    }

    if (profile.role !== 'admin' && profile.role !== 'superadmin') {
      throw new BadRequestException('Chỉ có thể phân quyền admin cho user có role admin hoặc superadmin');
    }

    // Check if already admin
    const { data: existing } = await this.supabase
      .from('branch_admins')
      .select('id')
      .eq('branch_id', branchId)
      .eq('user_id', dto.userId)
      .single();

    if (existing) {
      throw new ConflictException('Người dùng đã là admin của chi nhánh này');
    }

    // Insert admin assignment
    const { data: admin, error } = await this.supabase
      .from('branch_admins')
      .insert({
        branch_id: branchId,
        user_id: dto.userId,
        can_manage_staff: dto.canManageStaff ?? true,
        can_view_reports: dto.canViewReports ?? true,
        can_manage_bookings: dto.canManageBookings ?? true,
        can_manage_services: dto.canManageServices ?? false,
        assigned_by: assignedBy,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi phân quyền admin: ${error.message}`);
    }

    // Invalidate cache
    await this.invalidateBranchAdminsCache(branchId);

    return this.mapBranchAdminFromDb(admin);
  }

  async getBranchAdmins(branchId: string): Promise<BranchAdminWithDetails[]> {
    // Try cache first
    const cacheKey = this.CACHE_KEYS.branchAdmins(branchId);
    const cached = await this.redisService.get<BranchAdminWithDetails[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const { data, error } = await this.supabase
      .from('branch_admins')
      .select(`
        *,
        profiles!branch_admins_user_id_fkey(full_name, email, avatar_url),
        branches!branch_admins_branch_id_fkey(name)
      `)
      .eq('branch_id', branchId);

    if (error) {
      throw new BadRequestException(`Lỗi khi lấy danh sách admin: ${error.message}`);
    }

    const admins = (data || []).map(a => ({
      ...this.mapBranchAdminFromDb(a),
      fullName: a.profiles?.full_name,
      email: a.profiles?.email,
      avatarUrl: a.profiles?.avatar_url,
      branchName: a.branches?.name,
    }));

    // Cache result
    await this.redisService.set(cacheKey, admins, this.CACHE_TTL.BRANCH_STAFF);

    return admins;
  }

  async updateBranchAdmin(
    branchId: string,
    adminId: string,
    dto: UpdateBranchAdminDto
  ): Promise<BranchAdmin> {
    const updateData: any = {};
    if (dto.canManageStaff !== undefined) updateData.can_manage_staff = dto.canManageStaff;
    if (dto.canViewReports !== undefined) updateData.can_view_reports = dto.canViewReports;
    if (dto.canManageBookings !== undefined) updateData.can_manage_bookings = dto.canManageBookings;
    if (dto.canManageServices !== undefined) updateData.can_manage_services = dto.canManageServices;

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('Không có dữ liệu để cập nhật');
    }

    const { data: admin, error } = await this.supabase
      .from('branch_admins')
      .update(updateData)
      .eq('id', adminId)
      .eq('branch_id', branchId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi cập nhật quyền admin: ${error.message}`);
    }

    // Invalidate cache
    await this.invalidateBranchAdminsCache(branchId);

    return this.mapBranchAdminFromDb(admin);
  }

  async removeBranchAdmin(branchId: string, adminId: string): Promise<void> {
    const { error } = await this.supabase
      .from('branch_admins')
      .delete()
      .eq('id', adminId)
      .eq('branch_id', branchId);

    if (error) {
      throw new BadRequestException(`Lỗi khi xóa quyền admin: ${error.message}`);
    }

    // Invalidate cache
    await this.invalidateBranchAdminsCache(branchId);
  }

  // ==================== USER BRANCHES ====================

  async getUserBranches(userId: string): Promise<any[]> {
    // Try cache first
    const cacheKey = this.CACHE_KEYS.userBranches(userId);
    const cached = await this.redisService.get<any[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Use PostgreSQL function
    const { data, error } = await this.supabase
      .rpc('get_user_branches', { p_user_id: userId });

    if (error) {
      throw new BadRequestException(`Lỗi khi lấy chi nhánh của user: ${error.message}`);
    }

    // Cache result
    await this.redisService.set(cacheKey, data || [], this.CACHE_TTL.BRANCH_STAFF);

    return data || [];
  }

  // ==================== BRANCH STATS ====================

  async getBranchStats(branchId: string, dto?: GetBranchStatsDto): Promise<BranchStats> {
    // For now, return basic stats from branch table
    const branch = await this.getBranchById(branchId);
    
    // TODO: Implement detailed stats from appointments table
    return {
      branchId: branch.id,
      branchName: branch.name,
      totalStaff: branch.totalStaff || 0,
      totalStylists: branch.activeStylists || 0,
      totalManagers: branch.managers || 0,
      totalReceptionists: 0,
      totalBookings: branch.totalBookings,
      completedBookings: 0,
      cancelledBookings: 0,
      todayBookings: 0,
      monthlyBookings: 0,
      totalRevenue: 0,
      monthlyRevenue: 0,
      averageRating: branch.averageRating,
      totalReviews: 0,
    };
  }

  // ==================== UTILITY METHODS ====================

  async isBranchAdmin(userId: string, branchId: string): Promise<boolean> {
    // Check if user is SuperAdmin or Admin
    const { data: profile } = await this.supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (profile && (profile.role === 'admin' || profile.role === 'superadmin')) {
      return true;
    }

    // Check if user is branch admin
    const { data: admin } = await this.supabase
      .from('branch_admins')
      .select('id')
      .eq('user_id', userId)
      .eq('branch_id', branchId)
      .single();

    return !!admin;
  }

  // ==================== HELPER METHODS ====================

  private mapBranchFromDb(data: any): Branch {
    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      code: data.code,
      phone: data.phone,
      email: data.email,
      address: data.address,
      ward: data.ward,
      district: data.district,
      city: data.city,
      country: data.country || 'Vietnam',
      postalCode: data.postal_code,
      latitude: data.latitude ? parseFloat(data.latitude) : undefined,
      longitude: data.longitude ? parseFloat(data.longitude) : undefined,
      isActive: data.is_active,
      isPrimary: data.is_primary,
      openingDate: data.opening_date ? new Date(data.opening_date) : undefined,
      workingHours: data.working_hours || {},
      imageUrl: data.image_url,
      description: data.description,
      amenities: data.amenities || [],
      totalStylists: data.total_stylists || 0,
      totalBookings: data.total_bookings || 0,
      averageRating: data.average_rating ? parseFloat(data.average_rating) : 0,
      metaTitle: data.meta_title,
      metaDescription: data.meta_description,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  private mapBranchWithDetailsFromDb(data: any): BranchWithDetails {
    return {
      ...this.mapBranchFromDb(data),
      totalStaff: data.total_staff || 0,
      activeStylists: data.active_stylists || 0,
      managers: data.managers || 0,
      admins: data.admins || [],
    };
  }

  private mapBranchStaffFromDb(data: any): BranchStaff {
    return {
      id: data.id,
      branchId: data.branch_id,
      userId: data.user_id,
      role: data.role,
      isActive: data.is_active,
      isPrimaryBranch: data.is_primary_branch,
      joinedAt: new Date(data.joined_at),
      leftAt: data.left_at ? new Date(data.left_at) : undefined,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  private mapBranchStaffWithDetailsFromDb(data: any): BranchStaffWithDetails {
    return {
      ...this.mapBranchStaffFromDb(data),
      branchName: data.branch_name,
      branchCity: data.branch_city,
      fullName: data.full_name,
      email: data.email,
      phone: data.phone,
      avatarUrl: data.avatar_url,
      userRole: data.user_role,
      isBranchAdmin: data.is_branch_admin,
    };
  }

  private mapBranchAdminFromDb(data: any): BranchAdmin {
    return {
      id: data.id,
      branchId: data.branch_id,
      userId: data.user_id,
      canManageStaff: data.can_manage_staff,
      canViewReports: data.can_view_reports,
      canManageBookings: data.can_manage_bookings,
      canManageServices: data.can_manage_services,
      assignedAt: new Date(data.assigned_at),
      assignedBy: data.assigned_by,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  // Cache invalidation
  private async invalidateBranchCache(id: string): Promise<void> {
    await this.redisService.delete(this.CACHE_KEYS.branch(id));
  }

  private async invalidateBranchStaffCache(branchId: string): Promise<void> {
    await this.redisService.delete(this.CACHE_KEYS.branchStaff(branchId));
  }

  private async invalidateBranchAdminsCache(branchId: string): Promise<void> {
    await this.redisService.delete(this.CACHE_KEYS.branchAdmins(branchId));
  }

  private async invalidateUserBranchesCache(userId: string): Promise<void> {
    await this.redisService.delete(this.CACHE_KEYS.userBranches(userId));
  }

  private async invalidateAllBranchCaches(): Promise<void> {
    const client = this.redisService.getClient();
    const patterns = ['branch:*', 'branches:*'];

    for (const pattern of patterns) {
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(...keys);
      }
    }
  }
}