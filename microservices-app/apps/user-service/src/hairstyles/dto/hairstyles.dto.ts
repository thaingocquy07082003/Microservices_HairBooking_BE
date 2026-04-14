import { IsString, IsNumber, IsEnum, IsArray, IsBoolean, IsOptional, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { HairstyleCategory } from '@app/common';

export class CreateHairstyleDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  price: number;

  @IsNumber()
  @Min(15)
  @Transform(({ value }) => parseInt(value, 10))
  duration: number;

  // Không bắt buộc nữa — có thể truyền file ảnh thay thế
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsEnum(HairstyleCategory)
  category: HairstyleCategory;

  @IsEnum(['easy', 'medium', 'hard'])
  difficulty: 'easy' | 'medium' | 'hard';

  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) =>
    typeof value === 'string' ? JSON.parse(value) : value,
  )
  stylistIds: string[];

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean = true;

  @IsString()
  category_id: string;
}

export class UpdateHairstyleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? parseFloat(value) : undefined))
  price?: number;

  @IsNumber()
  @Min(15)
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : undefined))
  duration?: number;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsEnum(HairstyleCategory)
  @IsOptional()
  category?: HairstyleCategory;

  @IsEnum(['easy', 'medium', 'hard'])
  @IsOptional()
  difficulty?: 'easy' | 'medium' | 'hard';

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    return typeof value === 'string' ? JSON.parse(value) : value;
  })
  stylistIds?: string[];

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    return value === 'true' || value === true;
  })
  isActive?: boolean;
}

export class FilterHairstyleDto {
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
  limit?: number = 10;

  @IsOptional()
  @IsEnum(HairstyleCategory)
  category?: HairstyleCategory;

  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsString()
  stylistId?: string;

  @IsOptional()
  @IsEnum(['easy', 'medium', 'hard'])
  difficulty?: 'easy' | 'medium' | 'hard';

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(['price', 'duration', 'name', 'createdAt'])
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean = true;
}

export class CreateStylistDto {
  @IsString()
  userId: string;

  @IsString()
  fullName: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseInt(value, 10))
  experience: number;

  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) =>
    typeof value === 'string' ? JSON.parse(value) : value,
  )
  specialties: string[];
}

export class UpdateStylistDto {
  @IsString()
  @IsOptional()
  fullName?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : undefined))
  experience?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    return typeof value === 'string' ? JSON.parse(value) : value;
  })
  specialties?: string[];

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    return value === 'true' || value === true;
  })
  isAvailable?: boolean;
}