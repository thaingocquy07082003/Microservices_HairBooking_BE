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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
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
import { SelfUpdateGuard } from './guards/self-update.guard';

// Cấu hình multer dùng chung cho cả hairstyle image và stylist avatar
const imageUploadInterceptor = FileInterceptor('image', {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new BadRequestException('Chỉ chấp nhận file ảnh'), false);
    }
    cb(null, true);
  },
});

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
   * [PUBLIC] Xem kiểu tóc theo thợ cắt
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
   * [PUBLIC] Xem các thợ cắt tóc có thể thực hiện một kiểu tóc
   * Roles: ALL (không cần đăng nhập)
   */
  @Get(':hairstyleId/stylists')
  @HttpCode(HttpStatus.OK)
  async getStylistsByHairstyle(@Param('hairstyleId') hairstyleId: string) {
    const stylists = await this.hairstylesService.getStylistsByHairstyle(hairstyleId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách thợ cắt tóc theo kiểu tóc thành công',
      data: stylists,
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
   *
   * Nhận multipart/form-data với field "image" là file ảnh (tùy chọn).
   * Nếu không gửi file, cần truyền imageUrl trong body.
   * Các field số (price, duration) và mảng (stylistIds) cần serialize thành string/JSON khi gửi form-data.
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(imageUploadInterceptor)
  async createHairstyle(
    @Body() dto: CreateHairstyleDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const hairstyle = await this.hairstylesService.createHairstyle(dto, file);
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
   *
   * Nhận multipart/form-data với field "image" là file ảnh (tùy chọn).
   * Nếu gửi file mới → upload lên Cloudinary và cập nhật imageUrl.
   * Nếu không gửi file → giữ nguyên ảnh cũ (hoặc truyền imageUrl mới trong body).
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(imageUploadInterceptor)
  async updateHairstyle(
    @Param('id') id: string,
    @Body() dto: UpdateHairstyleDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const hairstyle = await this.hairstylesService.updateHairstyle(id, dto, file);
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
   *
   * Nhận multipart/form-data với field "image" là file avatar (tùy chọn).
   * Nếu không gửi file, có thể truyền avatarUrl trong body.
   */
  @Post('stylists')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(imageUploadInterceptor)
  async createStylist(
    @Body() dto: CreateStylistDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const stylist = await this.hairstylesService.createStylist(dto, file);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Tạo thợ cắt tóc thành công',
      data: stylist,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [ADMIN + HAIRSTYLIST] Cập nhật thông tin thợ cắt tóc
   * Roles: Admin, SuperAdmin, HairStylist (chỉ cập nhật thông tin của chính mình)
   *
   * Nhận multipart/form-data với field "image" là file avatar mới (tùy chọn).
   * SelfUpdateGuard đảm bảo HairStylist chỉ update chính mình.
   */
  @Put('stylists/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, SelfUpdateGuard)
  @Roles(Role.HairStylist, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(imageUploadInterceptor)
  async updateStylist(
    @Param('id') id: string,
    @Body() dto: UpdateStylistDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const stylist = await this.hairstylesService.updateStylist(id, dto, file);
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
   * Roles: HairStylist, Manager, Admin, SuperAdmin
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