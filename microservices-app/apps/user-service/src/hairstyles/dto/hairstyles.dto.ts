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
  price: number;

  @IsNumber()
  @Min(15)
  duration: number;

  @IsString()
  imageUrl: string;

  @IsEnum(HairstyleCategory)
  category: HairstyleCategory;

  @IsEnum(['easy', 'medium', 'hard'])
  difficulty: 'easy' | 'medium' | 'hard';

  @IsArray()
  @IsString({ each: true })
  stylistIds: string[];

  @IsBoolean()
  @IsOptional()
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
  price?: number;

  @IsNumber()
  @Min(15)
  @IsOptional()
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
  stylistIds?: string[];

  @IsBoolean()
  @IsOptional()
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
  stylistId?: string; // Lọc theo thợ cắt tóc

  @IsOptional()
  @IsEnum(['easy', 'medium', 'hard'])
  difficulty?: 'easy' | 'medium' | 'hard';

  @IsOptional()
  @IsString()
  search?: string; // Tìm kiếm theo tên

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
  experience: number;

  @IsArray()
  @IsString({ each: true })
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
  experience?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  specialties?: string[];

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;
}