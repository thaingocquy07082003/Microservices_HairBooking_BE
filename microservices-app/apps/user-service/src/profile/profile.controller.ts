import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ProfilesService } from './profile.service';
import {
  UpdateProfileDto,
  UpdateProfileByAdminDto,
  GetProfilesFilterDto,
} from './dto/profile.dto';
import { JwtAuthGuard, Role, User } from '@app/common';
import { RolesGuard } from '@app/common/strategies/roles.guard';
import { Roles } from '@app/common/decorators/roles.decorator';
import { ProfileUpdateGuard, ViewProfilesListGuard } from './guards/profile.guard';

@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  // ==================== USER ENDPOINTS (Tự quản lý profile) ====================

  /**
   * [USER] Xem profile của chính mình
   * Roles: ALL authenticated users
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getMyProfile(@User() user: any) {
    const profile = await this.profilesService.getProfileById(user.id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin profile thành công',
      data: profile,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [USER] Cập nhật profile của chính mình
   * Roles: ALL authenticated users
   * Note: Chỉ có thể cập nhật fullName, phone, avatarUrl
   */
  @Put('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateMyProfile(
    @User() user: any,
    @Body() dto: UpdateProfileDto,
  ) {
    const profile = await this.profilesService.updateOwnProfile(user.id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật profile thành công',
      data: profile,
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== ADMIN/MANAGER ENDPOINTS ====================

  /**
   * [ADMIN/MANAGER] Xem danh sách tất cả profiles
   * Roles: SuperAdmin, Admin, Manager
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard, ViewProfilesListGuard)
  @Roles(Role.SuperAdmin, Role.Admin, Role.Manager)
  @HttpCode(HttpStatus.OK)
  async getAllProfiles(@Query() filter: GetProfilesFilterDto) {
    const result = await this.profilesService.getAllProfiles(filter);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách profiles thành công',
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
   * [PUBLIC for specific user, ADMIN for any user] Xem profile theo ID
   * Roles: ALL authenticated users (chỉ xem được profile của mình hoặc nếu là Admin/Manager)
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getProfileById(
    @Param('id') id: string,
    @User() user: any,
  ) {
    // Nếu không phải admin/manager, chỉ được xem profile của mình
    if (user.id !== id) {
      const allowedRoles = [Role.SuperAdmin, Role.Admin, Role.Manager];
      if (!allowedRoles.includes(user.role)) {
        return {
          statusCode: HttpStatus.FORBIDDEN,
          message: 'Bạn chỉ có thể xem profile của chính mình',
          timestamp: new Date().toISOString(),
        };
      }
    }

    const profile = await this.profilesService.getProfileById(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin profile thành công',
      data: profile,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [ADMIN/MANAGER + USER] Cập nhật profile
   * Roles: SuperAdmin, Admin, Manager (cập nhật người khác), hoặc chính user đó
   * 
   * ProfileUpdateGuard đảm bảo:
   * - User chỉ được update chính mình (qua endpoint /me được khuyến nghị)
   * - SuperAdmin có thể update tất cả
   * - Admin có thể update tất cả trừ SuperAdmin
   * - Manager có thể update Customer, Staff, Stylist
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, ProfileUpdateGuard)
  @Roles(Role.SuperAdmin, Role.Admin, Role.Manager, Role.Customer, Role.Receptionist, Role.HairStylist)
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @Param('id') id: string,
    @Body() dto: UpdateProfileByAdminDto,
    @User() user: any,
  ) {
    // Nếu user đang update chính mình, chỉ cho phép update các field an toàn
    if (user.id === id) {
      const safeDto: UpdateProfileDto = {
        fullName: dto.fullName,
        phone: dto.phone,
        avatarUrl: dto.avatarUrl,
      };
      const profile = await this.profilesService.updateOwnProfile(id, safeDto);
      return {
        statusCode: HttpStatus.OK,
        message: 'Cập nhật profile thành công',
        data: profile,
        timestamp: new Date().toISOString(),
      };
    }

    // Admin/Manager update profile người khác
    const profile = await this.profilesService.updateProfileByAdmin(id, dto, user.role);
    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật profile thành công',
      data: profile,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [ADMIN] Xóa profile
   * Roles: SuperAdmin (hard delete), Admin (soft delete - reset về customer)
   * Note: Manager không có quyền xóa profile
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SuperAdmin, Role.Admin)
  @HttpCode(HttpStatus.OK)
  async deleteProfile(
    @Param('id') id: string,
    @User() user: any,
  ) {
    await this.profilesService.deleteProfile(id, user.role);
    return {
      statusCode: HttpStatus.OK,
      message: user.role === Role.SuperAdmin 
        ? 'Xóa profile thành công' 
        : 'Vô hiệu hóa profile thành công',
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== UTILITY ENDPOINTS ====================

  /**
   * [ADMIN] Lấy thống kê profiles theo role
   * Roles: SuperAdmin, Admin, Manager
   */
  @Get('stats/by-role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SuperAdmin, Role.Admin, Role.Manager)
  @HttpCode(HttpStatus.OK)
  async getProfileStatsByRole() {
    // Lấy tất cả profiles và đếm theo role
    const allProfiles = await this.profilesService.getAllProfiles({
      page: 1,
      limit: 1000, // Lấy nhiều để thống kê
    });

    const stats = allProfiles.data.reduce((acc, profile) => {
      acc[profile.role] = (acc[profile.role] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thống kê profiles thành công',
      data: {
        total: allProfiles.total,
        byRole: stats,
        verified: allProfiles.data.filter(p => p.verified).length,
        unverified: allProfiles.data.filter(p => !p.verified).length,
      },
      timestamp: new Date().toISOString(),
    };
  }
}