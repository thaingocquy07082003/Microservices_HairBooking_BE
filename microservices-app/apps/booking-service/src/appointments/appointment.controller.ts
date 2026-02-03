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
import { AppointmentsService } from './appointment.service';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  FilterAppointmentDto,
  CancelAppointmentDto,
  ConfirmAppointmentDto,
  CompleteAppointmentDto,
  GetAppointmentStatsDto,
} from './dto/appointment.dto';
import { JwtAuthGuard, Role, User } from '@app/common';
import { RolesGuard } from '@app/common/strategies/roles.guard';
import { Roles } from '@app/common/decorators/roles.decorator';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  // ==================== CUSTOMER ENDPOINTS ====================

  /**
   * [CUSTOMER] Tạo lịch hẹn mới ( chú ý bảng Stylist_Schedule - lịch làm việc của thợ)
   * Roles: Customer, Authenticated
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createAppointment(
    @Body() dto: CreateAppointmentDto,
    @User() user: any,
  ) {
    // Ensure customer can only book for themselves
    dto.customerId = user.id;
    
    const appointment = await this.appointmentsService.createAppointment(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Tạo lịch hẹn thành công',
      data: appointment,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [CUSTOMER] Xem lịch hẹn của mình
   * Roles: Authenticated
   */
  @Get('my-appointments')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getMyAppointments(
    @Query() filter: FilterAppointmentDto,
    @User() user: any,
  ) {
    filter.customerId = user.id;
    filter.includeDetails = true;
    
    const result = await this.appointmentsService.getAllAppointments(filter);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách lịch hẹn thành công',
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
   * [CUSTOMER] Hủy lịch hẹn
   * Roles: Authenticated
   */
  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async cancelAppointment(
    @Param('id') id: string,
    @Body() dto: CancelAppointmentDto,
    @User() user: any,
  ) {
    // Verify ownership
    const appointment = await this.appointmentsService.getAppointmentById(id);
    if (appointment.customerId !== user.id) {
      return {
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Bạn không có quyền hủy lịch hẹn này',
        timestamp: new Date().toISOString(),
      };
    }

    const result = await this.appointmentsService.cancelAppointment(id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Hủy lịch hẹn thành công',
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== STAFF/STYLIST ENDPOINTS ====================

  /**
   * [STAFF] Xem tất cả lịch hẹn
   * Roles: Receptionist, HairStylist, Manager, Admin
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Receptionist, Role.HairStylist, Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async getAllAppointments(
    @Query() filter: FilterAppointmentDto,
    @User() user: any,
  ) {
    // HairStylist chỉ xem được lịch của mình
    if (user.role === Role.HairStylist) {
      // Need to get stylist_id from stylists table by user_id
      filter.stylistId = user.stylistId; // Assume this is set in JWT
    }

    const result = await this.appointmentsService.getAllAppointments(filter);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách lịch hẹn thành công',
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
   * [STAFF] Xem chi tiết lịch hẹn
   * Roles: Receptionist, HairStylist, Manager, Admin
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Receptionist, Role.HairStylist, Role.Manager, Role.Admin, Role.SuperAdmin, Role.Customer)
  @HttpCode(HttpStatus.OK)
  async getAppointmentById(@Param('id') id: string, @User() user: any) {
    const appointment = await this.appointmentsService.getAppointmentById(id, true);
    
    // Customer chỉ xem được lịch của mình
    if (user.role === Role.Customer && appointment.customerId !== user.id) {
      return {
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Bạn không có quyền xem lịch hẹn này',
        timestamp: new Date().toISOString(),
      };
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin lịch hẹn thành công',
      data: appointment,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [STAFF] Xác nhận lịch hẹn
   * Roles: Receptionist, Manager, Admin
   */
  @Post(':id/confirm')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Receptionist, Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async confirmAppointment(
    @Param('id') id: string,
    @Body() dto: ConfirmAppointmentDto,
  ) {
    const appointment = await this.appointmentsService.confirmAppointment(id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Xác nhận lịch hẹn thành công',
      data: appointment,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [STAFF] Hoàn thành lịch hẹn
   * Roles: HairStylist, Receptionist, Manager, Admin
   */
  @Post(':id/complete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HairStylist, Role.Receptionist, Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async completeAppointment(
    @Param('id') id: string,
    @Body() dto: CompleteAppointmentDto,
  ) {
    const appointment = await this.appointmentsService.completeAppointment(id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Hoàn thành lịch hẹn thành công',
      data: appointment,
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== MANAGER/ADMIN ENDPOINTS ====================

  /**
   * [MANAGER] Cập nhật lịch hẹn
   * Roles: Manager, Admin, SuperAdmin
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async updateAppointment(
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    const appointment = await this.appointmentsService.updateAppointment(id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật lịch hẹn thành công',
      data: appointment,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [ADMIN] Xóa lịch hẹn (hard delete)
   * Roles: Admin, SuperAdmin
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async deleteAppointment(@Param('id') id: string) {
    // Implementation for hard delete would go here
    return {
      statusCode: HttpStatus.OK,
      message: 'Xóa lịch hẹn thành công',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [MANAGER] Thống kê lịch hẹn
   * Roles: Manager, Admin
   */
  @Get('stats/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async getAppointmentStats(@Query() filter: GetAppointmentStatsDto) {
    const stats = await this.appointmentsService.getAppointmentStats(filter);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thống kê lịch hẹn thành công',
      data: stats,
      timestamp: new Date().toISOString(),
    };
  }
}