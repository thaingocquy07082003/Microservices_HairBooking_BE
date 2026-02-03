import { 
  IsUUID, 
  IsEnum, 
  IsNumber, 
  IsOptional, 
  Min,
  IsBoolean
} from 'class-validator';
import { Transform } from 'class-transformer';
import { QueueStatus } from '@app/common/entities/booking.entity';

// ==================== ADD TO QUEUE ====================

export class AddToQueueDto {
  @IsUUID()
  appointmentId: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  estimatedWaitMinutes?: number;
}

// ==================== UPDATE QUEUE ====================

export class UpdateQueueDto {
  @IsEnum(QueueStatus)
  @IsOptional()
  status?: QueueStatus;

  @IsNumber()
  @Min(1)
  @IsOptional()
  queuePosition?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  estimatedWaitMinutes?: number;
}

// ==================== MOVE QUEUE POSITION ====================

export class MoveQueuePositionDto {
  @IsNumber()
  @Min(1)
  newPosition: number;
}

// ==================== GET QUEUE ====================

export class GetQueueDto {
  @IsEnum(QueueStatus)
  @IsOptional()
  status?: QueueStatus;

  @IsUUID()
  @IsOptional()
  stylistId?: string; // Lọc theo stylist

  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsOptional()
  includeAppointmentDetails?: boolean = true;
}

// ==================== CALL NEXT IN QUEUE ====================

export class CallNextDto {
  @IsUUID()
  @IsOptional()
  stylistId?: string; // Nếu không truyền, gọi next chung

  @IsBoolean()
  @IsOptional()
  sendNotification?: boolean = true;
}