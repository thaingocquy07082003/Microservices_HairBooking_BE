import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { RedisService } from '@app/redis';
import { CreateHairCategoryDto, UpdateHairCategoryDto, FilterHairCategoryDto, ReorderCategoriesDto } from './dto/category.dto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';

export interface HairCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  imageUrl?: string;
  displayOrder: number;
  isActive: boolean;
  metaTitle?: string;
  metaDescription?: string;
  hairstyleCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class HairCategoriesService {
  private supabase: SupabaseClient;
  
  // Cache TTL
  private readonly CACHE_TTL = {
    CATEGORY: 7200,     // 2 hours (categories change less frequently)
    LIST: 1800,         // 30 minutes
    ACTIVE_LIST: 3600,  // 1 hour (for public facing)
  };

  // Cache keys
  private readonly CACHE_KEYS = {
    category: (id: string) => `hair_category:${id}`,
    categoryBySlug: (slug: string) => `hair_category:slug:${slug}`,
    categoriesList: (filter: string) => `hair_categories:list:${filter}`,
    activeCategories: () => `hair_categories:active`,
    allCategories: () => `hair_categories:all`,
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

  // ==================== CREATE ====================

  async createCategory(dto: CreateHairCategoryDto): Promise<HairCategory> {
    // Check if slug already exists
    const { data: existing } = await this.supabase
      .from('hair_categories')
      .select('id')
      .eq('slug', dto.slug)
      .single();

    if (existing) {
      throw new ConflictException(`Category với slug "${dto.slug}" đã tồn tại`);
    }

    // Check if name already exists
    const { data: existingName } = await this.supabase
      .from('hair_categories')
      .select('id')
      .eq('name', dto.name)
      .single();

    if (existingName) {
      throw new ConflictException(`Category với tên "${dto.name}" đã tồn tại`);
    }

    // Insert category
    const { data: category, error } = await this.supabase
      .from('hair_categories')
      .insert({
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        icon: dto.icon,
        image_url: dto.imageUrl,
        display_order: dto.displayOrder ?? 0,
        is_active: dto.isActive ?? true,
        meta_title: dto.metaTitle,
        meta_description: dto.metaDescription,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi tạo danh mục: ${error.message}`);
    }

    // Invalidate cache
    await this.invalidateAllCaches();

    return this.mapCategoryFromDb(category);
  }

  // ==================== READ ====================

  async getCategoryById(id: string): Promise<HairCategory> {
    // Try cache first
    const cacheKey = this.CACHE_KEYS.category(id);
    const cached = await this.redisService.get<HairCategory>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from database with hairstyle count
    const { data, error } = await this.supabase
      .from('hair_categories')
      .select(`
        *,
        hairstyles:hairstyles(count)
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Không tìm thấy danh mục với ID: ${id}`);
    }

    const category = this.mapCategoryFromDb(data);
    category.hairstyleCount = data.hairstyles?.[0]?.count || 0;

    // Cache result
    await this.redisService.set(cacheKey, category, this.CACHE_TTL.CATEGORY);

    return category;
  }

  async getCategoryBySlug(slug: string): Promise<HairCategory> {
    // Try cache first
    const cacheKey = this.CACHE_KEYS.categoryBySlug(slug);
    const cached = await this.redisService.get<HairCategory>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const { data, error } = await this.supabase
      .from('hair_categories')
      .select(`
        *,
        hairstyles:hairstyles(count)
      `)
      .eq('slug', slug)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Không tìm thấy danh mục với slug: ${slug}`);
    }

    const category = this.mapCategoryFromDb(data);
    category.hairstyleCount = data.hairstyles?.[0]?.count || 0;

    // Cache result
    await this.redisService.set(cacheKey, category, this.CACHE_TTL.CATEGORY);

    return category;
  }

  async getAllCategories(filter: FilterHairCategoryDto): Promise<{
    data: HairCategory[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    // Create cache key based on filter
    const filterKey = JSON.stringify(filter);
    const cacheKey = this.CACHE_KEYS.categoriesList(filterKey);
    
    // Try cache first
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    // Build query
    let query = this.supabase
      .from('hair_categories')
      .select(`
        *,
        hairstyles:hairstyles(count)
      `, { count: 'exact' });

    // Apply filters
    if (filter.isActive !== undefined) {
      query = query.eq('is_active', filter.isActive);
    }
    if (filter.search) {
      query = query.or(`name.ilike.%${filter.search}%,description.ilike.%${filter.search}%`);
    }

    // Sorting
    const sortBy = filter.sortBy || 'display_order';
    const order = filter.order || 'asc';
    
    // Map sortBy to database column
    const dbSortBy = sortBy === 'displayOrder' ? 'display_order' : 
                     sortBy === 'createdAt' ? 'created_at' :
                     sortBy === 'updatedAt' ? 'updated_at' : sortBy;
    
    query = query.order(dbSortBy, { ascending: order === 'asc' });

    // Pagination
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const offset = (page - 1) * limit;
    
    query = query.range(offset, offset + limit - 1);

    // Execute query
    const { data, count, error } = await query;

    if (error) {
      throw new BadRequestException(`Lỗi khi lấy danh sách danh mục: ${error.message}`);
    }

    const categories = (data || []).map(c => {
      const category = this.mapCategoryFromDb(c);
      category.hairstyleCount = c.hairstyles?.[0]?.count || 0;
      return category;
    });

    const result = {
      data: categories,
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
   * Get active categories (for public display)
   */
  async getActiveCategories(): Promise<HairCategory[]> {
    // Try cache first
    const cacheKey = this.CACHE_KEYS.activeCategories();
    const cached = await this.redisService.get<HairCategory[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const { data, error } = await this.supabase
      .from('hair_categories')
      .select(`
        *,
        hairstyles:hairstyles(count)
      `)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      throw new BadRequestException(`Lỗi khi lấy danh sách danh mục: ${error.message}`);
    }

    const categories = (data || []).map(c => {
      const category = this.mapCategoryFromDb(c);
      category.hairstyleCount = c.hairstyles?.[0]?.count || 0;
      return category;
    });

    // Cache result
    await this.redisService.set(cacheKey, categories, this.CACHE_TTL.ACTIVE_LIST);

    return categories;
  }

  // ==================== UPDATE ====================

  async updateCategory(id: string, dto: UpdateHairCategoryDto): Promise<HairCategory> {
    // Verify category exists
    await this.getCategoryById(id);

    // Check slug uniqueness if being updated
    if (dto.slug) {
      const { data: existing } = await this.supabase
        .from('hair_categories')
        .select('id')
        .eq('slug', dto.slug)
        .neq('id', id)
        .single();

      if (existing) {
        throw new ConflictException(`Category với slug "${dto.slug}" đã tồn tại`);
      }
    }

    // Check name uniqueness if being updated
    if (dto.name) {
      const { data: existing } = await this.supabase
        .from('hair_categories')
        .select('id')
        .eq('name', dto.name)
        .neq('id', id)
        .single();

      if (existing) {
        throw new ConflictException(`Category với tên "${dto.name}" đã tồn tại`);
      }
    }

    // Build update data
    const updateData: any = {};
    if (dto.name) updateData.name = dto.name;
    if (dto.slug) updateData.slug = dto.slug;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.icon !== undefined) updateData.icon = dto.icon;
    if (dto.imageUrl !== undefined) updateData.image_url = dto.imageUrl;
    if (dto.displayOrder !== undefined) updateData.display_order = dto.displayOrder;
    if (dto.isActive !== undefined) updateData.is_active = dto.isActive;
    if (dto.metaTitle !== undefined) updateData.meta_title = dto.metaTitle;
    if (dto.metaDescription !== undefined) updateData.meta_description = dto.metaDescription;

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('Không có dữ liệu để cập nhật');
    }

    // Update category
    const { data: category, error } = await this.supabase
      .from('hair_categories')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi cập nhật danh mục: ${error.message}`);
    }

    // Invalidate cache
    await this.invalidateCategoryCache(id);
    await this.invalidateAllCaches();

    return this.mapCategoryFromDb(category);
  }

  /**
   * Reorder categories - Update display_order for multiple categories
   */
  async reorderCategories(dto: ReorderCategoriesDto): Promise<HairCategory[]> {
    const { categoryIds } = dto;

    // Update each category with new display_order
    const updates = categoryIds.map((categoryId, index) => 
      this.supabase
        .from('hair_categories')
        .update({ display_order: index })
        .eq('id', categoryId)
    );

    await Promise.all(updates);

    // Invalidate cache
    await this.invalidateAllCaches();

    // Return updated categories
    return this.getActiveCategories();
  }

  // ==================== DELETE ====================

  async deleteCategory(id: string): Promise<void> {
    // Check if category has hairstyles
    const { data: hairstyles } = await this.supabase
      .from('hairstyles')
      .select('id')
      .eq('category_id', id)
      .limit(1);

    if (hairstyles && hairstyles.length > 0) {
      throw new BadRequestException(
        'Không thể xóa danh mục đang có kiểu tóc. Vui lòng di chuyển hoặc xóa các kiểu tóc trước.'
      );
    }

    // Delete category
    const { error } = await this.supabase
      .from('hair_categories')
      .delete()
      .eq('id', id);

    if (error) {
      throw new BadRequestException(`Lỗi khi xóa danh mục: ${error.message}`);
    }

    // Invalidate cache
    await this.invalidateCategoryCache(id);
    await this.invalidateAllCaches();
  }

  /**
   * Soft delete - set isActive = false
   */
  async deactivateCategory(id: string): Promise<HairCategory> {
    return this.updateCategory(id, { isActive: false });
  }

  // ==================== STATISTICS ====================

  async getCategoryStats() {
    const { data, error } = await this.supabase
      .from('hair_categories')
      .select(`
        id,
        name,
        slug,
        is_active,
        hairstyles:hairstyles(count)
      `);

    if (error) {
      throw new BadRequestException(`Lỗi khi lấy thống kê: ${error.message}`);
    }

    return {
      total: data.length,
      active: data.filter(c => c.is_active).length,
      inactive: data.filter(c => !c.is_active).length,
      byCategory: data.map(c => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        isActive: c.is_active,
        hairstyleCount: c.hairstyles?.[0]?.count || 0,
      })),
    };
  }

  // ==================== HELPER METHODS ====================

  private mapCategoryFromDb(data: any): HairCategory {
    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      icon: data.icon,
      imageUrl: data.image_url,
      displayOrder: data.display_order,
      isActive: data.is_active,
      metaTitle: data.meta_title,
      metaDescription: data.meta_description,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  // Cache invalidation methods
  private async invalidateCategoryCache(id: string): Promise<void> {
    await this.redisService.delete(this.CACHE_KEYS.category(id));
  }

  private async invalidateAllCaches(): Promise<void> {
    const client = this.redisService.getClient();
    
    // Delete all category-related caches
    const patterns = [
      'hair_category:*',
      'hair_categories:*',
    ];

    for (const pattern of patterns) {
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(...keys);
      }
    }
  }
}