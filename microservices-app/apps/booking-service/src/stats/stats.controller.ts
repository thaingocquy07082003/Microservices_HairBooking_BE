import {
  Controller,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { StatsService } from './stats.service';
import { GetStatsDto } from './dto/stats.dto';
import { JwtAuthGuard, Role, User } from '@app/common';

@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  /**
   * GET /api/v1/stats/revenue
   *
   * - Admin  → thống kê toàn hệ thống
   * - Stylist → thống kê cá nhân
   *
   * Bearer token bắt buộc. Role khác (customer, staff …) trả 401.
   */
  @Get('revenue')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getRevenueStats(
    @Query() dto: GetStatsDto,
    @User() user: any,
  ) {
    if (user.role === Role.Admin || user.role === Role.SuperAdmin) {
      const data = await this.statsService.getAdminStats(dto, user.id);
      return {
        statusCode: HttpStatus.OK,
        message: 'Lấy thống kê admin thành công',
        role: 'admin',
        period: dto.period,
        data,
        timestamp: new Date().toISOString(),
      };
    }

    if (user.role === Role.HairStylist) {
      const data = await this.statsService.getStylistStats(dto, user.id);
      return {
        statusCode: HttpStatus.OK,
        message: 'Lấy thống kê stylist thành công',
        role: 'stylist',
        period: dto.period,
        data,
        timestamp: new Date().toISOString(),
      };
    }

    throw new UnauthorizedException(
      'Chỉ Admin và Stylist mới có quyền xem thống kê doanh thu',
    );
  }
}