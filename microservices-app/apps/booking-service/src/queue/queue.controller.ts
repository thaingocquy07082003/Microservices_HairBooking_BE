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
import { QueueService } from './queue.service';
import {
  AddToQueueDto,
  UpdateQueueDto,
  MoveQueuePositionDto,
  GetQueueDto,
  CallNextDto,
} from './dto/queue.dto';
import { JwtAuthGuard, Role } from '@app/common';
import { RolesGuard } from '@app/common/strategies/roles.guard';
import { Roles } from '@app/common/decorators/roles.decorator';

@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  /**
   * [STAFF] Thêm vào hàng đợi
   * Roles: Receptionist, Manager, Admin
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Receptionist, Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.CREATED)
  async addToQueue(@Body() dto: AddToQueueDto) {
    const queueItem = await this.queueService.addToQueue(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Thêm vào hàng đợi thành công',
      data: queueItem,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [STAFF] Xem hàng đợi
   * Roles: Receptionist, HairStylist, Manager, Admin
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Receptionist, Role.HairStylist, Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async getQueue(@Query() filter: GetQueueDto) {
    const queue = await this.queueService.getQueue(filter);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách hàng đợi thành công',
      data: queue,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [STAFF] Gọi khách tiếp theo
   * Roles: Receptionist, HairStylist, Manager, Admin
   */
  @Post('call-next')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Receptionist, Role.HairStylist, Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async callNext(@Body() dto: CallNextDto) {
    const next = await this.queueService.callNext(dto);
    
    if (!next) {
      return {
        statusCode: HttpStatus.OK,
        message: 'Không có khách trong hàng đợi',
        data: null,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'Gọi khách tiếp theo thành công',
      data: next,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [STAFF] Cập nhật trạng thái trong queue
   * Roles: Receptionist, HairStylist, Manager, Admin
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Receptionist, Role.HairStylist, Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async updateQueue(
    @Param('id') id: string,
    @Body() dto: UpdateQueueDto,
  ) {
    const queueItem = await this.queueService.updateQueue(id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật hàng đợi thành công',
      data: queueItem,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [STAFF] Di chuyển vị trí trong queue
   * Roles: Receptionist, Manager, Admin
   */
  @Put(':id/position')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Receptionist, Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async moveQueuePosition(
    @Param('id') id: string,
    @Body() dto: MoveQueuePositionDto,
  ) {
    const queueItem = await this.queueService.moveQueuePosition(id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Di chuyển vị trí thành công',
      data: queueItem,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [STAFF] Xóa khỏi hàng đợi
   * Roles: Receptionist, Manager, Admin
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Receptionist, Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async removeFromQueue(@Param('id') id: string) {
    await this.queueService.removeFromQueue(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Xóa khỏi hàng đợi thành công',
      timestamp: new Date().toISOString(),
    };
  }
}