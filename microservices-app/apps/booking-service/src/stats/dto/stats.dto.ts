import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export enum StatsPeriod {
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}

export class GetStatsDto {
  @IsEnum(StatsPeriod)
  period: StatsPeriod = StatsPeriod.WEEK;

  /**
   * Dùng khi admin muốn lọc theo chi nhánh (tuỳ chọn).
   */
  @IsUUID()
  @IsOptional()
  branchId?: string;
}