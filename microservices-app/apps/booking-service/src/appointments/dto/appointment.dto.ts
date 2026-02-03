import { 
  IsString, 
  IsUUID, 
  IsDate, 
  IsNumber, 
  IsEnum, 
  IsBoolean, 
  IsOptional, 
  MinLength, 
  Min,
  Max,
  Matches,
  IsEmail,
  ValidateNested
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { AppointmentStatus } from '@app/common/entities/booking.entity';

// ==================== CREATE APPOINTMENT ====================

export class CreateAppointmentDto {
  @IsUUID()
  customerId: string;

  @IsUUID()
  stylistId: string;

  @IsUUID()
  hairstyleId: string;

  @Transform(({ value }) => new Date(value))
  @IsDate()
  appointmentDate: Date;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { 
    message: 'startTime phải có định dạng HH:mm (ví dụ: 09:30)' 
  })
  startTime: string;

  @IsNumber()
  @Min(15)
  duration: number;

  @IsString()
  @MinLength(2)
  customerName: string;

  @IsString()
  @Matches(/^[0-9]{10,11}$/, { message: 'Số điện thoại không hợp lệ' })
  customerPhone: string;

  @IsEmail()
  @IsOptional()
  customerEmail?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  depositAmount?: number;

  @IsBoolean()
  @IsOptional()
  depositPaid?: boolean;
}

// ==================== UPDATE APPOINTMENT ====================

export class UpdateAppointmentDto {
  @IsUUID()
  @IsOptional()
  stylistId?: string;

  @IsUUID()
  @IsOptional()
  hairstyleId?: string;

  @Transform(({ value }) => new Date(value))
  @IsDate()
  @IsOptional()
  appointmentDate?: Date;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
  @IsOptional()
  startTime?: string;

  @IsNumber()
  @Min(15)
  @IsOptional()
  duration?: number;

  @IsString()
  @MinLength(2)
  @IsOptional()
  customerName?: string;

  @IsString()
  @Matches(/^[0-9]{10,11}$/)
  @IsOptional()
  customerPhone?: string;

  @IsEmail()
  @IsOptional()
  customerEmail?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsEnum(AppointmentStatus)
  @IsOptional()
  status?: AppointmentStatus;

  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  depositAmount?: number;

  @IsBoolean()
  @IsOptional()
  depositPaid?: boolean;
}

// ==================== FILTER/SEARCH APPOINTMENTS ====================

export class FilterAppointmentDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  stylistId?: string;

  @IsOptional()
  @IsUUID()
  hairstyleId?: string;

  @IsOptional()
  @Transform(({ value }) => new Date(value))
  @IsDate()
  dateFrom?: Date;

  @IsOptional()
  @Transform(({ value }) => new Date(value))
  @IsDate()
  dateTo?: Date;

  @IsOptional()
  @IsString()
  search?: string; // Tìm kiếm theo tên hoặc số điện thoại

  @IsOptional()
  @IsString()
  sortBy?: string = 'appointmentDate';

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'asc';

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeDetails?: boolean = false; // Include stylist, hairstyle details
}

// ==================== CANCEL APPOINTMENT ====================

export class CancelAppointmentDto {
  @IsString()
  @MinLength(10, { message: 'Lý do hủy phải có ít nhất 10 ký tự' })
  cancellationReason: string;
}

// ==================== CONFIRM APPOINTMENT ====================

export class ConfirmAppointmentDto {
  @IsBoolean()
  @IsOptional()
  sendNotification?: boolean = true;

  @IsString()
  @IsOptional()
  notes?: string;
}

// ==================== RESCHEDULE APPOINTMENT ====================

export class RescheduleAppointmentDto {
  @Transform(({ value }) => new Date(value))
  @IsDate()
  newAppointmentDate: Date;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
  newStartTime: string;

  @IsUUID()
  @IsOptional()
  newStylistId?: string; // Có thể đổi thợ cắt

  @IsString()
  @IsOptional()
  reason?: string;
}

// ==================== COMPLETE APPOINTMENT ====================

export class CompleteAppointmentDto {
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number; // Customer rating for stylist

  @IsString()
  @IsOptional()
  feedback?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  actualPrice?: number; // Giá thực tế nếu khác giá dự kiến

  @IsString()
  @IsOptional()
  notes?: string;
}

// ==================== CHECK AVAILABILITY ====================

export class CheckAvailabilityDto {
  @IsUUID()
  stylistId: string;

  @Transform(({ value }) => new Date(value))
  @IsDate()
  date: Date;

  @IsNumber()
  @Min(15)
  duration: number;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { 
    message: 'startTime phải có định dạng HH:mm (ví dụ: 09:30)' 
  })
  startTime: string;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { 
    message: 'startTime phải có định dạng HH:mm (ví dụ: 09:30)' 
  })
  endTime: string;

  @IsUUID()
  @IsOptional()
  excludeAppointmentId?: string; // Dùng khi reschedule
}

// ==================== GET AVAILABLE SLOTS ====================

export class GetAvailableSlotsDto {
  @Type(() => Date)
  @IsDate()
  date: Date;

  @IsUUID()
  @IsOptional()
  stylistId?: string; // Nếu không truyền, lấy tất cả thợ

  @IsNumber()
  @Min(15)
  @IsOptional()
  duration?: number; // Thời gian dự kiến

  @IsNumber()
  @Min(15)
  @IsOptional()
  slotInterval?: number = 30; // Khoảng cách giữa các slot (phút)
}

// ==================== BULK OPERATIONS ====================

export class BulkUpdateStatusDto {
  @IsUUID(undefined, { each: true })
  appointmentIds: string[];

  @IsEnum(AppointmentStatus)
  status: AppointmentStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}

// ==================== APPOINTMENT STATS ====================

export class GetAppointmentStatsDto {
  @Transform(({ value }) => new Date(value))
  @IsDate()
  @IsOptional()
  dateFrom?: Date;

  @Transform(({ value }) => new Date(value))
  @IsDate()
  @IsOptional()
  dateTo?: Date;

  @IsUUID()
  @IsOptional()
  stylistId?: string;

  @IsUUID()
  @IsOptional()
  customerId?: string;
}