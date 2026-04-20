import {
  IsString, IsOptional, MinLength,
  IsNumber, Min, Max, IsEnum,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateNotificationDto {
  @IsString()
  @MinLength(3, { message: 'Tiêu đề phải có ít nhất 3 ký tự' })
  title?: string;

  @IsString()
  @MinLength(5, { message: 'Nội dung phải có ít nhất 5 ký tự' })
  content?: string;
}

export class UpdateNotificationDto {
  @IsString()
  @MinLength(3)
  @IsOptional()
  title?: string;

  @IsString()
  @MinLength(5)
  @IsOptional()
  content?: string;
}

export class FilterNotificationDto {
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
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';
}