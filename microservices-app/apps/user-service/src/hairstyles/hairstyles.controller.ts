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
import { HairstylesService } from './hairstyles.service';
import {
  CreateHairstyleDto,
  UpdateHairstyleDto,
  FilterHairstyleDto,
  CreateStylistDto,
  UpdateStylistDto,
} from './dto/hairstyles.dto';
import { JwtAuthGuard, Role } from '@app/common';
import { RolesGuard } from '@app/common/strategies/roles.guard';
import { Roles } from '@app/common/decorators/roles.decorator';

@Controller('hairstyles')
export class HairstylesController {
  constructor(private readonly hairstylesService: HairstylesService) {}

  // ==================== PUBLIC ENDPOINTS (Customer) ====================

  /**
   * [PUBLIC] Xem tất cả kiểu tóc - Dành cho khách hàng
   * Roles: ALL (không cần đăng nhập)
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllHairstyles(@Query() filter: FilterHairstyleDto) {
    const result = await this.hairstylesService.getAllHairstyles(filter);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách kiểu tóc thành công',
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
   * [PUBLIC] Xem chi tiết 1 kiểu tóc
   * Roles: ALL (không cần đăng nhập)
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getHairstyleById(@Param('id') id: string) {
    const hairstyle = await this.hairstylesService.getHairstyleById(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin kiểu tóc thành công',
      data: hairstyle,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [PUBLIC] Xem kiểu tóc theo thợ cắt - Khách chọn thợ để xem style
   * Roles: ALL (không cần đăng nhập)
   */
  @Get('by-stylist/:stylistId')
  @HttpCode(HttpStatus.OK)
  async getHairstylesByStylist(@Param('stylistId') stylistId: string) {
    const hairstyles = await this.hairstylesService.getHairstylesByStylist(stylistId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách kiểu tóc theo thợ cắt thành công',
      data: hairstyles,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [PUBLIC] Xem tất cả thợ cắt tóc
   * Roles: ALL (không cần đăng nhập)
   */
  @Get('stylists/all')
  @HttpCode(HttpStatus.OK)
  async getAllStylists() {
    const stylists = await this.hairstylesService.getAllStylists();
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách thợ cắt tóc thành công',
      data: stylists,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [PUBLIC] Xem chi tiết thợ cắt tóc
   * Roles: ALL (không cần đăng nhập)
   */
  @Get('stylists/:id')
  @HttpCode(HttpStatus.OK)
  async getStylistById(@Param('id') id: string) {
    const stylist = await this.hairstylesService.getStylistById(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin thợ cắt tóc thành công',
      data: stylist,
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== MANAGER ENDPOINTS ====================

  /**
   * [MANAGER] Tạo kiểu tóc mới
   * Roles: Manager, Admin, SuperAdmin
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.CREATED)
  async createHairstyle(@Body() dto: CreateHairstyleDto) {
    const hairstyle = await this.hairstylesService.createHairstyle(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Tạo kiểu tóc thành công',
      data: hairstyle,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [MANAGER] Cập nhật kiểu tóc
   * Roles: Manager, Admin, SuperAdmin
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async updateHairstyle(
    @Param('id') id: string,
    @Body() dto: UpdateHairstyleDto,
  ) {
    const hairstyle = await this.hairstylesService.updateHairstyle(id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật kiểu tóc thành công',
      data: hairstyle,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [MANAGER] Xóa kiểu tóc (soft delete - set isActive = false)
   * Roles: Manager, Admin, SuperAdmin
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async deleteHairstyle(@Param('id') id: string) {
    await this.hairstylesService.deleteHairstyle(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Xóa kiểu tóc thành công',
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== ADMIN ENDPOINTS (Stylist Management) ====================

  /**
   * [ADMIN] Tạo thợ cắt tóc mới
   * Roles: Admin, SuperAdmin
   */
  @Post('stylists')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.CREATED)
  async createStylist(@Body() dto: CreateStylistDto) {
    const stylist = await this.hairstylesService.createStylist(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Tạo thợ cắt tóc thành công',
      data: stylist,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [ADMIN] Cập nhật thông tin thợ cắt tóc
   * Roles: Admin, SuperAdmin, HairStylist (chỉ cập nhật thông tin của chính mình)
   */
  @Put('stylists/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HairStylist, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async updateStylist(
    @Param('id') id: string,
    @Body() dto: UpdateStylistDto,
  ) {
    // TODO: Thêm logic kiểm tra HairStylist chỉ được update chính mình
    const stylist = await this.hairstylesService.updateStylist(id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật thợ cắt tóc thành công',
      data: stylist,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [ADMIN] Xóa thợ cắt tóc
   * Roles: Admin, SuperAdmin only
   */
  @Delete('stylists/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async deleteStylist(@Param('id') id: string) {
    await this.hairstylesService.deleteStylist(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Xóa thợ cắt tóc thành công',
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== RECEPTIONIST ENDPOINTS ====================

  /**
   * [RECEPTIONIST] Xem danh sách kiểu tóc để tư vấn khách
   * Roles: Receptionist, Manager, Admin, SuperAdmin
   */
  @Get('receptionist/available')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Receptionist, Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async getAvailableHairstyles(@Query() filter: FilterHairstyleDto) {
    // Chỉ lấy những kiểu tóc đang active
    filter.isActive = true;
    const result = await this.hairstylesService.getAllHairstyles(filter);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách kiểu tóc khả dụng thành công',
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

  // ==================== HAIRSTYLIST ENDPOINTS ====================

  /**
   * [HAIRSTYLIST] Xem các kiểu tóc mình có thể cắt
   * Roles: HairStylist
   */
  @Get('my-hairstyles/:stylistId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HairStylist, Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async getMyHairstyles(@Param('stylistId') stylistId: string) {
    const hairstyles = await this.hairstylesService.getHairstylesByStylist(stylistId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách kiểu tóc của bạn thành công',
      data: hairstyles,
      timestamp: new Date().toISOString(),
    };
  }
}