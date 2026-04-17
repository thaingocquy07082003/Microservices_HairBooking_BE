import { 
  IsString, 
  IsUUID, 
  IsDate, 
  IsBoolean, 
  IsOptional, 
  Matches,
  IsArray,
  ValidateNested,
  ArrayMinSize
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

// ==================== CREATE SCHEDULE ====================

export class CreateScheduleDto {
  @IsUUID()
  stylistId: string;

  @Transform(({ value }) => new Date(value))
  @IsDate()
  workDate: Date;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { 
    message: 'startTime phải có định dạng HH:mm' 
  })
  startTime: string;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { 
    message: 'endTime phải có định dạng HH:mm' 
  })
  endTime: string;

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean = true;

  @IsBoolean()
  @IsOptional()
  isDayOff?: boolean = false;

  @IsString()
  @IsOptional()
  notes?: string;

  @ValidateNested({ each: true })
  @Type(() => BreakTimeDto)
  @IsOptional()
  breakTimes?: BreakTimeDto[];
}

// ==================== BREAK TIME ====================

export class BreakTimeDto {
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
  breakStart: string;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
  breakEnd: string;

  @IsString()
  @IsOptional()
  reason?: string;
}

// ==================== UPDATE SCHEDULE ====================

export class UpdateScheduleDto {
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
  @IsOptional()
  startTime?: string;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
  @IsOptional()
  endTime?: string;

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @IsBoolean()
  @IsOptional()
  isDayOff?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;

  @ValidateNested({ each: true })
  @Type(() => BreakTimeDto)
  @IsOptional()
  breakTimes?: BreakTimeDto[];
}

// ==================== BULK CREATE SCHEDULES ====================
// ✅ UPDATED: stylistIds nhận MẢNG string để seed cho NHIỀU stylist trong 1 lần call

export class BulkCreateScheduleDto {
  /**
   * Danh sách UUID của các stylist cần seed lịch.
   * Có thể truyền 1 hoặc nhiều stylist, mỗi stylist sẽ được tạo lịch
   * trên toàn bộ khoảng thời gian [startDate, endDate] theo workDays.
   *
   * Hỗ trợ 2 kiểu input cho tiện:
   *  - JSON array: ["uuid-1", "uuid-2"]
   *  - Chuỗi cách nhau bằng dấu phẩy: "uuid-1,uuid-2" (tự split)
   */
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      return value.split(',').map(v => v.trim()).filter(Boolean);
    }
    return value;
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'stylistIds phải có ít nhất 1 stylist' })
  @IsUUID('all', { each: true, message: 'Mỗi stylistId phải là UUID hợp lệ' })
  stylistIds: string[];

  @Transform(({ value }) => new Date(value))
  @IsDate()
  startDate: Date;

  @Transform(({ value }) => new Date(value))
  @IsDate()
  endDate: Date;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
  startTime: string;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
  endTime: string;

  @IsArray()
  @IsOptional()
  excludeDates?: Date[]; // Các ngày loại trừ

  @IsArray()
  @Transform(({ value }) => Array.isArray(value) ? value.map(Number) : value)
  @IsOptional()
  workDays?: number[]; // 0 = Sunday, 1 = Monday, ... (nếu không truyền = all days)

  @ValidateNested({ each: true })
  @Type(() => BreakTimeDto)
  @IsOptional()
  breakTimes?: BreakTimeDto[];
}

// ==================== GET SCHEDULES ====================

export class GetSchedulesDto {
  @IsUUID()
  @IsOptional()
  stylistId?: string;

  @Transform(({ value }) => new Date(value))
  @IsDate()
  @IsOptional()
  dateFrom?: Date;

  @Transform(({ value }) => new Date(value))
  @IsDate()
  @IsOptional()
  dateTo?: Date;

  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsOptional()
  isAvailable?: boolean;

  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsOptional()
  excludeDayOff?: boolean = true;
}

// ==================== BLACKOUT DATE ====================

export class CreateBlackoutDateDto {
  @Transform(({ value }) => new Date(value))
  @IsDate()
  blackoutDate: Date;

  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  appliesToAll?: boolean = true;

  @IsUUID()
  @IsOptional()
  stylistId?: string; // Nếu chỉ áp dụng cho 1 thợ cụ thể
}

export class UpdateBlackoutDateDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  appliesToAll?: boolean;

  @IsUUID()
  @IsOptional()
  stylistId?: string;
}

// ==================== COPY SCHEDULE ====================

export class CopyScheduleDto {
  @IsUUID()
  sourceStylistId: string;

  @IsUUID()
  targetStylistId: string;

  @Transform(({ value }) => new Date(value))
  @IsDate()
  sourceDateFrom: Date;

  @Transform(({ value }) => new Date(value))
  @IsDate()
  sourceDateTo: Date;

  @Transform(({ value }) => new Date(value))
  @IsDate()
  targetDateFrom: Date;

  @IsBoolean()
  @IsOptional()
  overwriteExisting?: boolean = false;
}