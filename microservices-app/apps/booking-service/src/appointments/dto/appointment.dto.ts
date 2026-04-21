// booking-service/src/appointments/dto/appointment.dto.ts

import {
  IsString,
  IsUUID,
  IsDate,
  IsNumber,
  IsEnum,
  IsBoolean,
  IsOptional,
  IsArray,
  MinLength,
  Min,
  Max,
  Matches,
  IsEmail,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { AppointmentStatus } from '@app/common/entities/booking.entity';

// ==================== CREATE APPOINTMENT ====================

export class CreateAppointmentDto {
  @IsUUID()
  customerId?: string;

  @IsUUID()
  stylistId?: string;

  @IsUUID()
  hairstyleId?: string;

  /**
   * ✅ NEW: Danh sách service IDs (optional - nullable)
   * Khách hàng có thể đặt lịch kèm theo các dịch vụ bổ sung.
   * Nếu không có dịch vụ nào, bỏ qua hoặc truyền null/[].
   */
  @IsArray()
  @IsUUID('all', { each: true, message: 'Mỗi serviceId phải là UUID hợp lệ' })
  @IsOptional()
  serviceIds?: string[] | null;

  @Transform(({ value }) => new Date(value))
  @IsDate()
  appointmentDate?: Date;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'startTime phải có định dạng HH:mm (ví dụ: 09:30)',
  })
  startTime?: string;

  @IsNumber()
  @Min(15)
  duration?: number;

  @IsString()
  @MinLength(2)
  customerName?: string;

  @IsString()
  @Matches(/^[0-9]{10,11}$/, { message: 'Số điện thoại không hợp lệ' })
  customerPhone?: string;

  @IsEmail()
  @IsOptional()
  customerEmail?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsNumber()
  @Min(0)
  price?: number;

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

  /**
   * ✅ NEW: Cập nhật danh sách service IDs.
   * Truyền [] để xóa toàn bộ services, null/undefined để giữ nguyên.
   */
  @IsArray()
  @IsUUID('all', { each: true, message: 'Mỗi serviceId phải là UUID hợp lệ' })
  @IsOptional()
  serviceIds?: string[] | null;

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

  /**
   * ✅ NEW: Lọc các appointment có chứa serviceId này
   */
  @IsOptional()
  @IsUUID()
  serviceId?: string;

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
  search?: string;

  @IsOptional()
  @IsString()
  sortBy?: string = 'appointmentDate';

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'asc';

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeDetails?: boolean = false;
}

// ==================== CANCEL APPOINTMENT ====================

export class CancelAppointmentDto {
  @IsString()
  @MinLength(3, { message: 'Lý do hủy phải có ít nhất 3 ký tự' })
  cancellationReason?: string;
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
  newAppointmentDate?: Date;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
  newStartTime?: string;

  @IsUUID()
  @IsOptional()
  newStylistId?: string;

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
  rating?: number;

  @IsString()
  @IsOptional()
  feedback?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  actualPrice?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

// ==================== CHECK AVAILABILITY ====================

export class CheckAvailabilityDto {
  @IsUUID()
  stylistId?: string;

  @Transform(({ value }) => new Date(value))
  @IsDate()
  date?: Date;

  @IsNumber()
  @Min(15)
  duration?: number;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'startTime phải có định dạng HH:mm (ví dụ: 09:30)',
  })
  startTime?: string;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'endTime phải có định dạng HH:mm (ví dụ: 09:30)',
  })
  endTime?: string;

  @IsUUID()
  @IsOptional()
  excludeAppointmentId?: string;
}

// ==================== GET AVAILABLE SLOTS ====================

export class GetAvailableSlotsDto {
  @Transform(({ value }) => new Date(value))
  @IsDate()
  date?: Date;

  @IsUUID()
  @IsOptional()
  stylistId?: string;

  @IsNumber()
  @Min(15)
  @IsOptional()
  duration?: number;

  @IsNumber()
  @Min(15)
  @IsOptional()
  slotInterval?: number = 30;
}

// ==================== BULK OPERATIONS ====================

export class BulkUpdateStatusDto {
  @IsUUID(undefined, { each: true })
  appointmentIds?: string[];

  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

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