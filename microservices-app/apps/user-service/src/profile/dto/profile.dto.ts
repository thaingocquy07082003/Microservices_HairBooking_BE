import { IsString, IsEmail, IsEnum, IsBoolean, IsOptional, MinLength, Matches } from 'class-validator';
import { Role } from '@app/common';

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  @MinLength(2, { message: 'Họ tên phải có ít nhất 2 ký tự' })
  fullName?: string;

  @IsString()
  @IsOptional()
  @Matches(/^[0-9]{10,11}$/, { message: 'Số điện thoại không hợp lệ' })
  phone?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;
}

export class UpdateProfileByAdminDto extends UpdateProfileDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsOptional()
  email?: string;

  @IsEnum(Role, { message: 'Role không hợp lệ' })
  @IsOptional()
  role?: Role;

  @IsBoolean()
  @IsOptional()
  verified?: boolean;
}

export class GetProfilesFilterDto {
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @IsOptional()
  @IsString()
  search?: string; // Tìm kiếm theo email hoặc fullName

  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  page?: number = 1;

  @IsOptional()
  limit?: number = 10;
}