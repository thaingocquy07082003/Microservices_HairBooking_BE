import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { GetAvailableSlotsDto, CheckAvailabilityDto } from '../appointments/dto/appointment.dto';

@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  /**
   * [PUBLIC] Lấy các time slots khả dụng
   * Roles: ALL
   */
  @Get('slots')
  @HttpCode(HttpStatus.OK)
  async getAvailableSlots(@Query() dto: GetAvailableSlotsDto) {
    const slots = await this.availabilityService.getAvailableSlots(dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách time slots thành công',
      data: slots,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * [PUBLIC] Kiểm tra availability
   * Roles: ALL
   */
  @Post('check')
  @HttpCode(HttpStatus.OK)
  async checkAvailability(@Body() dto: CheckAvailabilityDto) {
    const isAvailable = await this.availabilityService.checkAvailability(dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Kiểm tra availability thành công',
      data: {
        available: isAvailable,
        stylistId: dto.stylistId,
        date: dto.date,
        duration: dto.duration,
      },
      timestamp: new Date().toISOString(),
    };
  }
}