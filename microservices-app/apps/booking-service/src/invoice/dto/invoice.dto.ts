import {
  IsString, IsUUID, IsNumber, IsEnum, IsBoolean,
  IsOptional, IsEmail, IsArray, ValidateNested,
  Min, IsDate, Matches, MinLength, Max
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { InvoiceStatus, PaymentMethod } from '@app/common/entities/invoice.entity';

export class CreateInvoiceItemDto {
  @IsString()
  name: string;

  @IsEnum(['service', 'product', 'discount', 'other'])
  @IsOptional()
  itemType?: 'service' | 'product' | 'discount' | 'other' = 'service';

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsUUID()
  @IsOptional()
  hairstyleId?: string;
}

export class CreateInvoiceDto {
  @IsUUID()
  @IsOptional()
  appointmentId?: string;

  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsString()
  customerName: string;

  @IsString()
  @Matches(/^[0-9]{10,11}$/)
  customerPhone: string;

  @IsEmail()
  @IsOptional()
  customerEmail?: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsUUID()
  @IsOptional()
  stylistId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items: CreateInvoiceItemDto[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  discountAmount?: number = 0;

  @IsNumber()
  @Min(0)
  @IsOptional()
  taxAmount?: number = 0;

  @IsString()
  @IsOptional()
  notes?: string;

  @Transform(({ value }) => new Date(value))
  @IsDate()
  @IsOptional()
  dueDate?: Date;
}

export class UpdateInvoiceDto {
  @IsString()
  @IsOptional()
  customerName?: string;

  @IsString()
  @IsOptional()
  customerPhone?: string;

  @IsEmail()
  @IsOptional()
  customerEmail?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  @IsOptional()
  items?: CreateInvoiceItemDto[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  discountAmount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  taxAmount?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class PayInvoiceDto {
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsString()
  @IsOptional()
  paymentReference?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CancelInvoiceDto {
  @IsString()
  @MinLength(5)
  cancellationReason: string;
}

export class SendInvoiceEmailDto {
  @IsEmail()
  @IsOptional()
  overrideEmail?: string; // Ghi đè email nếu muốn gửi đến địa chỉ khác
}

export class FilterInvoiceDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  stylistId?: string;

  @IsOptional()
  @IsString()
  search?: string; // Tìm theo tên, SĐT, invoice number

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
  sortBy?: string = 'created_at';

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';
}

export class GetInvoiceStatsDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @Transform(({ value }) => new Date(value))
  @IsDate()
  dateFrom?: Date;

  @IsOptional()
  @Transform(({ value }) => new Date(value))
  @IsDate()
  dateTo?: Date;
}