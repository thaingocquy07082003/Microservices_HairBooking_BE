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
import { SchedulingService } from './scheduling.service';
import {
  CreateScheduleDto,
  UpdateScheduleDto,
  BulkCreateScheduleDto,
  GetSchedulesDto,
  CreateBlackoutDateDto,
  UpdateBlackoutDateDto,
} from './dto/scheduling.dto';
import { JwtAuthGuard, Role } from '@app/common';
import { RolesGuard } from '@app/common/strategies/roles.guard';
import { Roles } from '@app/common/decorators/roles.decorator';

@Controller('schedules')
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  // ==================== MANAGER/ADMIN ENDPOINTS ====================

  /**
   * [MANAGER] Tạo lịch làm việc cho stylist
   * Roles: Manager, Admin
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.CREATED)
  async createSchedule(@Body() dto: CreateScheduleDto) {
    const schedule = await this.schedulingService.createSchedule(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Tạo lịch làm việc thành công',
      data: schedule,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [MANAGER] Tạo nhiều lịch làm việc cùng lúc
   * Roles: Manager, Admin
   */
  @Post('bulk')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.CREATED)
  async bulkCreateSchedules(@Body() dto: BulkCreateScheduleDto) {
    const schedules = await this.schedulingService.bulkCreateSchedules(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: `Tạo ${schedules.length} lịch làm việc thành công`,
      data: schedules,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [PUBLIC/STAFF] Xem lịch làm việc
   * Roles: ALL (public endpoint cho customer xem lịch available)
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async getSchedules(@Query() filter: GetSchedulesDto) {
    const schedules = await this.schedulingService.getSchedules(filter);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách lịch làm việc thành công',
      data: schedules,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [MANAGER] Cập nhật lịch làm việc
   * Roles: Manager, Admin
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async updateSchedule(
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    const schedule = await this.schedulingService.updateSchedule(id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật lịch làm việc thành công',
      data: schedule,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [MANAGER] Xóa lịch làm việc
   * Roles: Manager, Admin
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async deleteSchedule(@Param('id') id: string) {
    await this.schedulingService.deleteSchedule(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Xóa lịch làm việc thành công',
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== BLACKOUT DATES ====================

  /**
   * [MANAGER] Tạo ngày nghỉ (blackout date)
   * Roles: Manager, Admin
   */
  @Post('blackout-dates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.CREATED)
  async createBlackoutDate(@Body() dto: CreateBlackoutDateDto) {
    const blackout = await this.schedulingService.createBlackoutDate(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Tạo ngày nghỉ thành công',
      data: blackout,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [PUBLIC] Xem danh sách ngày nghỉ
   * Roles: ALL
   */
  @Get('blackout-dates')
  @HttpCode(HttpStatus.OK)
  async getBlackoutDates() {
    const blackouts = await this.schedulingService.GetAllBlackoutDate();
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách ngày nghỉ thành công',
      data: blackouts,
      timestamp: new Date().toISOString(),
    };
  }
}