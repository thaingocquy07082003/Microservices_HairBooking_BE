// booking-service/src/services/service.controller.ts

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
import { ServiceService } from './service.service';
import { CreateServiceDto, UpdateServiceDto, FilterServiceDto } from './dto/service.dto';
import { JwtAuthGuard, Role } from '@app/common';
import { RolesGuard } from '@app/common/strategies/roles.guard';
import { Roles } from '@app/common/decorators/roles.decorator';

@Controller('services')
export class ServiceController {
  constructor(private readonly serviceService: ServiceService) {}

  // ==================== [PUBLIC] XEM DỊCH VỤ ĐANG HOẠT ĐỘNG ====================

  /**
   * [PUBLIC] Lấy danh sách dịch vụ có is_available = true
   * GET /api/v1/services
   * Roles: ALL (không cần đăng nhập)
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async getAvailableServices(@Query() filter: FilterServiceDto) {
    const result = await this.serviceService.getAvailableServices(filter);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách dịch vụ thành công',
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
   * [PUBLIC] Xem chi tiết một dịch vụ (chỉ available)
   * GET /api/v1/services/:id
   * Roles: ALL
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getServiceById(@Param('id') id: string) {
    const service = await this.serviceService.getServiceById(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin dịch vụ thành công',
      data: service,
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== [ADMIN] QUẢN LÝ DỊCH VỤ ====================

  /**
   * [ADMIN] Xem tất cả dịch vụ kể cả đã xóa mềm
   * GET /api/v1/services/admin/all
   * Roles: Admin, SuperAdmin
   */
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async getAllServicesAdmin(@Query() filter: FilterServiceDto) {
    const result = await this.serviceService.getAllServicesAdmin(filter);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy toàn bộ danh sách dịch vụ thành công',
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
   * [ADMIN] Tạo dịch vụ mới
   * POST /api/v1/services/admin
   * Roles: Admin, SuperAdmin
   */
  @Post('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.CREATED)
  async createService(@Body() dto: CreateServiceDto) {
    const service = await this.serviceService.createService(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Tạo dịch vụ thành công',
      data: service,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [ADMIN] Cập nhật dịch vụ
   * PUT /api/v1/services/admin/:id
   * Roles: Admin, SuperAdmin
   */
  @Put('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async updateService(
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    const service = await this.serviceService.updateService(id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật dịch vụ thành công',
      data: service,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [ADMIN] Xóa mềm dịch vụ (đặt is_available = false)
   * DELETE /api/v1/services/admin/:id
   * Roles: Admin, SuperAdmin
   */
  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async softDeleteService(@Param('id') id: string) {
    const service = await this.serviceService.softDeleteService(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Xóa dịch vụ thành công (dịch vụ đã được ẩn khỏi danh sách)',
      data: service,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [ADMIN] Khôi phục dịch vụ đã xóa mềm (đặt is_available = true)
   * PUT /api/v1/services/admin/:id/restore
   * Roles: Admin, SuperAdmin
   */
  @Put('admin/:id/restore')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async restoreService(@Param('id') id: string) {
    const service = await this.serviceService.restoreService(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Khôi phục dịch vụ thành công',
      data: service,
      timestamp: new Date().toISOString(),
    };
  }
}