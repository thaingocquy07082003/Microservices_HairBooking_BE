import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import {
  CreateNotificationDto,
  UpdateNotificationDto,
  FilterNotificationDto,
} from './dto/notification.dto';
import { JwtAuthGuard, Role } from '@app/common';
import { RolesGuard } from '@app/common/strategies/roles.guard';
import { Roles } from '@app/common/decorators/roles.decorator';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  // ── PUBLIC ────────────────────────────────────────────────

  /** [PUBLIC] Xem tất cả thông báo */
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(@Query() filter: FilterNotificationDto) {
    const result = await this.notificationService.findAll(filter);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách thông báo thành công',
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

  /** [PUBLIC] Xem chi tiết một thông báo */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string) {
    const notification = await this.notificationService.findOne(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thông báo thành công',
      data: notification,
      timestamp: new Date().toISOString(),
    };
  }

  // ── ADMIN ONLY ────────────────────────────────────────────

  /** [ADMIN] Tạo thông báo mới */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateNotificationDto) {
    const notification = await this.notificationService.create(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Tạo thông báo thành công',
      data: notification,
      timestamp: new Date().toISOString(),
    };
  }

  /** [ADMIN] Cập nhật thông báo */
  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async update(@Param('id') id: string, @Body() dto: UpdateNotificationDto) {
    const notification = await this.notificationService.update(id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật thông báo thành công',
      data: notification,
      timestamp: new Date().toISOString(),
    };
  }

  /** [ADMIN] Xóa thông báo */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    await this.notificationService.remove(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Xóa thông báo thành công',
      timestamp: new Date().toISOString(),
    };
  }
}