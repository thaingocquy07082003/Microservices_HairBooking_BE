import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Patch,
} from '@nestjs/common';
import { HairCategoriesService } from './category.service';
import {
  CreateHairCategoryDto,
  UpdateHairCategoryDto,
  FilterHairCategoryDto,
  ReorderCategoriesDto,
} from './dto/category.dto';
import { JwtAuthGuard, Role } from '@app/common';
import { RolesGuard } from '@app/common/strategies/roles.guard';
import { Roles } from '@app/common/decorators/roles.decorator';

@Controller('hair-categories')
export class HairCategoriesController {
  constructor(private readonly hairCategoriesService: HairCategoriesService) {}

  // ==================== PUBLIC ENDPOINTS ====================

  /**
   * [PUBLIC] Get all active categories
   * Roles: ALL (không cần đăng nhập)
   * Use case: Hiển thị categories cho khách hàng trên website
   */
  @Get('active')
  @HttpCode(HttpStatus.OK)
  async getActiveCategories() {
    const categories = await this.hairCategoriesService.getActiveCategories();
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách danh mục thành công',
      data: categories,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [PUBLIC] Get category by slug
   * Roles: ALL (không cần đăng nhập)
   * Use case: Trang category detail (SEO friendly)
   */
  @Get('slug/:slug')
  @HttpCode(HttpStatus.OK)
  async getCategoryBySlug(@Param('slug') slug: string) {
    const category = await this.hairCategoriesService.getCategoryBySlug(slug);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin danh mục thành công',
      data: category,
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== ADMIN ENDPOINTS ====================

  /**
   * [ADMIN] Get all categories with filters
   * Roles: Admin, SuperAdmin
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async getAllCategories(@Query() filter: FilterHairCategoryDto) {
    const result = await this.hairCategoriesService.getAllCategories(filter);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách danh mục thành công',
      data: result.data,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [ADMIN] Get category by ID
   * Roles: Admin, SuperAdmin
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async getCategoryById(@Param('id') id: string) {
    const category = await this.hairCategoriesService.getCategoryById(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin danh mục thành công',
      data: category,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [ADMIN] Create new category
   * Roles: Admin, SuperAdmin
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.CREATED)
  async createCategory(@Body() dto: CreateHairCategoryDto) {
    const category = await this.hairCategoriesService.createCategory(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Tạo danh mục thành công',
      data: category,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [ADMIN] Update category
   * Roles: Admin, SuperAdmin
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateHairCategoryDto,
  ) {
    const category = await this.hairCategoriesService.updateCategory(id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật danh mục thành công',
      data: category,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [ADMIN] Reorder categories (change display order)
   * Roles: Admin, SuperAdmin
   */
  @Patch('reorder')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async reorderCategories(@Body() dto: ReorderCategoriesDto) {
    const categories = await this.hairCategoriesService.reorderCategories(dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Sắp xếp lại danh mục thành công',
      data: categories,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [ADMIN] Deactivate category (soft delete)
   * Roles: Admin, SuperAdmin
   */
  @Patch(':id/deactivate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async deactivateCategory(@Param('id') id: string) {
    const category = await this.hairCategoriesService.deactivateCategory(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Vô hiệu hóa danh mục thành công',
      data: category,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [SUPERADMIN] Delete category permanently
   * Roles: SuperAdmin only
   * Note: Cannot delete if category has hairstyles
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async deleteCategory(@Param('id') id: string) {
    await this.hairCategoriesService.deleteCategory(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Xóa danh mục thành công',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [ADMIN] Get category statistics
   * Roles: Admin, SuperAdmin
   */
  @Get('stats/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async getCategoryStats() {
    const stats = await this.hairCategoriesService.getCategoryStats();
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thống kê danh mục thành công',
      data: stats,
      timestamp: new Date().toISOString(),
    };
  }
}