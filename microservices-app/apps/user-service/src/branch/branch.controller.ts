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
} from '@nestjs/common';
import { BranchesService } from './branch.service';
import {
  CreateBranchDto,
  UpdateBranchDto,
  FilterBranchDto,
  AddStaffToBranchDto,
  UpdateBranchStaffDto,
  FilterBranchStaffDto,
  AssignBranchAdminDto,
  UpdateBranchAdminDto,
  GetBranchStatsDto,
} from './dto/branch.dto';
import { JwtAuthGuard, Role, User } from '@app/common';
import { RolesGuard } from '@app/common/strategies/roles.guard';
import { Roles } from '@app/common/decorators/roles.decorator';
import {
  BranchManagementGuard,
  BranchStaffManagementGuard,
  BranchReportsGuard,
  SystemAdminGuard,
} from './guard/branch.guard';

@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  // ==================== PUBLIC ENDPOINTS ====================

  /**
   * [PUBLIC] Xem tất cả chi nhánh đang hoạt động
   * Roles: ALL (không cần đăng nhập)
   * Use case: Khách hàng tìm chi nhánh gần nhất
   */
  @Get('active')
  @HttpCode(HttpStatus.OK)
  async getActiveBranches() {
    const branches = await this.branchesService.getActiveBranches();
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách chi nhánh thành công',
      data: branches,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [PUBLIC] Xem chi nhánh theo slug
   * Roles: ALL (không cần đăng nhập)
   */
  @Get('slug/:slug')
  @HttpCode(HttpStatus.OK)
  async getBranchBySlug(@Param('slug') slug: string) {
    const branch = await this.branchesService.getBranchBySlug(slug);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin chi nhánh thành công',
      data: branch,
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== USER ENDPOINTS ====================

  /**
   * [AUTHENTICATED] Xem các chi nhánh của mình
   * Roles: Staff, Stylist, Manager, Admin
   * Use case: Nhân viên xem chi nhánh được phân công
   */
  @Get('my-branches')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getMyBranches(@User() user: any) {
    const branches = await this.branchesService.getUserBranches(user.id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách chi nhánh của bạn thành công',
      data: branches,
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== ADMIN ENDPOINTS - BRANCH CRUD ====================

  /**
   * [ADMIN] Xem tất cả chi nhánh (có filter)
   * Roles: SuperAdmin, Admin
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SuperAdmin, Role.Admin)
  @HttpCode(HttpStatus.OK)
  async getAllBranches(@Query() filter: FilterBranchDto) {
    const result = await this.branchesService.getAllBranches(filter);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách chi nhánh thành công',
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
   * [ADMIN] Xem chi tiết chi nhánh
   * Roles: SuperAdmin, Admin, Manager (của chi nhánh đó)
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SuperAdmin, Role.Admin, Role.Manager)
  @HttpCode(HttpStatus.OK)
  async getBranchById(@Param('id') id: string) {
    const branch = await this.branchesService.getBranchById(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin chi nhánh thành công',
      data: branch,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [SYSTEM ADMIN] Tạo chi nhánh mới
   * Roles: SuperAdmin, Admin (hệ thống)
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard, SystemAdminGuard)
  @Roles(Role.SuperAdmin, Role.Admin)
  @HttpCode(HttpStatus.CREATED)
  async createBranch(@Body() dto: CreateBranchDto) {
    const branch = await this.branchesService.createBranch(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Tạo chi nhánh thành công',
      data: branch,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [BRANCH ADMIN] Cập nhật chi nhánh
   * Roles: SuperAdmin, Admin (được phân quyền)
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, BranchManagementGuard)
  @Roles(Role.SuperAdmin, Role.Admin)
  @HttpCode(HttpStatus.OK)
  async updateBranch(
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    const branch = await this.branchesService.updateBranch(id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật chi nhánh thành công',
      data: branch,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [SYSTEM ADMIN] Xóa chi nhánh (soft delete)
   * Roles: SuperAdmin, Admin (hệ thống)
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, SystemAdminGuard)
  @Roles(Role.SuperAdmin, Role.Admin)
  @HttpCode(HttpStatus.OK)
  async deleteBranch(@Param('id') id: string) {
    await this.branchesService.deleteBranch(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Xóa chi nhánh thành công',
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== STAFF MANAGEMENT ====================

  /**
   * [BRANCH ADMIN] Xem danh sách nhân viên trong chi nhánh
   * Roles: SuperAdmin, Admin, Manager (của chi nhánh đó)
   */
  @Get(':id/staff')
  @UseGuards(JwtAuthGuard, RolesGuard, BranchManagementGuard)
  @Roles(Role.SuperAdmin, Role.Admin, Role.Manager)
  @HttpCode(HttpStatus.OK)
  async getBranchStaff(
    @Param('id') branchId: string,
    @Query() filter: FilterBranchStaffDto,
  ) {
    const result = await this.branchesService.getBranchStaff(branchId, filter);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách nhân viên thành công',
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
   * [BRANCH ADMIN] Thêm nhân viên vào chi nhánh
   * Roles: SuperAdmin, Admin (có quyền can_manage_staff)
   */
  @Post(':id/staff')
  @UseGuards(JwtAuthGuard, RolesGuard, BranchStaffManagementGuard)
  @Roles(Role.SuperAdmin, Role.Admin)
  @HttpCode(HttpStatus.CREATED)
  async addStaffToBranch(
    @Param('id') branchId: string,
    @Body() dto: AddStaffToBranchDto,
  ) {
    const staff = await this.branchesService.addStaffToBranch(branchId, dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Thêm nhân viên vào chi nhánh thành công',
      data: staff,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [BRANCH ADMIN] Cập nhật thông tin nhân viên trong chi nhánh
   * Roles: SuperAdmin, Admin (có quyền can_manage_staff)
   */
  @Put(':id/staff/:staffId')
  @UseGuards(JwtAuthGuard, RolesGuard, BranchStaffManagementGuard)
  @Roles(Role.SuperAdmin, Role.Admin)
  @HttpCode(HttpStatus.OK)
  async updateBranchStaff(
    @Param('id') branchId: string,
    @Param('staffId') staffId: string,
    @Body() dto: UpdateBranchStaffDto,
  ) {
    const staff = await this.branchesService.updateBranchStaff(
      branchId,
      staffId,
      dto,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật nhân viên thành công',
      data: staff,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [BRANCH ADMIN] Xóa nhân viên khỏi chi nhánh
   * Roles: SuperAdmin, Admin (có quyền can_manage_staff)
   */
  @Delete(':id/staff/:staffId')
  @UseGuards(JwtAuthGuard, RolesGuard, BranchStaffManagementGuard)
  @Roles(Role.SuperAdmin, Role.Admin)
  @HttpCode(HttpStatus.OK)
  async removeStaffFromBranch(
    @Param('id') branchId: string,
    @Param('staffId') staffId: string,
  ) {
    await this.branchesService.removeStaffFromBranch(branchId, staffId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Xóa nhân viên khỏi chi nhánh thành công',
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== ADMIN ASSIGNMENT ====================

  /**
   * [SYSTEM ADMIN] Xem danh sách admin của chi nhánh
   * Roles: SuperAdmin, Admin
   */
  @Get(':id/admins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SuperAdmin, Role.Admin)
  @HttpCode(HttpStatus.OK)
  async getBranchAdmins(@Param('id') branchId: string) {
    const admins = await this.branchesService.getBranchAdmins(branchId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách admin chi nhánh thành công',
      data: admins,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [SYSTEM ADMIN] Phân quyền admin cho chi nhánh
   * Roles: SuperAdmin only
   */
  @Post(':id/admins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SuperAdmin)
  @HttpCode(HttpStatus.CREATED)
  async assignBranchAdmin(
    @Param('id') branchId: string,
    @Body() dto: AssignBranchAdminDto,
    @User() user: any,
  ) {
    const admin = await this.branchesService.assignBranchAdmin(
      branchId,
      dto,
      user.id,
    );
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Phân quyền admin chi nhánh thành công',
      data: admin,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [SYSTEM ADMIN] Cập nhật quyền admin
   * Roles: SuperAdmin only
   */
  @Put(':id/admins/:adminId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async updateBranchAdmin(
    @Param('id') branchId: string,
    @Param('adminId') adminId: string,
    @Body() dto: UpdateBranchAdminDto,
  ) {
    const admin = await this.branchesService.updateBranchAdmin(
      branchId,
      adminId,
      dto,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật quyền admin thành công',
      data: admin,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [SYSTEM ADMIN] Xóa quyền admin
   * Roles: SuperAdmin only
   */
  @Delete(':id/admins/:adminId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async removeBranchAdmin(
    @Param('id') branchId: string,
    @Param('adminId') adminId: string,
  ) {
    await this.branchesService.removeBranchAdmin(branchId, adminId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Xóa quyền admin thành công',
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== STATISTICS ====================

  /**
   * [BRANCH ADMIN] Xem thống kê chi nhánh
   * Roles: SuperAdmin, Admin (có quyền can_view_reports)
   */
  @Get(':id/stats')
  @UseGuards(JwtAuthGuard, RolesGuard, BranchReportsGuard)
  @Roles(Role.SuperAdmin, Role.Admin, Role.Manager)
  @HttpCode(HttpStatus.OK)
  async getBranchStats(
    @Param('id') branchId: string,
    @Query() dto: GetBranchStatsDto,
  ) {
    const stats = await this.branchesService.getBranchStats(branchId, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thống kê chi nhánh thành công',
      data: stats,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [SYSTEM ADMIN] Thống kê tổng quan tất cả chi nhánh
   * Roles: SuperAdmin, Admin
   */
  @Get('stats/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SuperAdmin, Role.Admin)
  @HttpCode(HttpStatus.OK)
  async getAllBranchesStats() {
    const branches = await this.branchesService.getActiveBranches();
    
    const totalStats = {
      totalBranches: branches.length,
      activeBranches: branches.filter(b => b.isActive).length,
      totalStylists: branches.reduce((sum, b) => sum + (b.activeStylists || 0), 0),
      totalStaff: branches.reduce((sum, b) => sum + (b.totalStaff || 0), 0),
      cities: [...new Set(branches.map(b => b.city))],
      branches: branches.map(b => ({
        id: b.id,
        name: b.name,
        city: b.city,
        totalStylists: b.activeStylists,
        totalStaff: b.totalStaff,
        totalBookings: b.totalBookings,
        averageRating: b.averageRating,
      })),
    };

    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thống kê tổng quan thành công',
      data: totalStats,
      timestamp: new Date().toISOString(),
    };
  }
}