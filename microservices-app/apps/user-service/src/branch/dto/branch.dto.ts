import { 
  IsString, 
  IsEmail, 
  IsBoolean, 
  IsOptional, 
  IsNumber, 
  IsObject, 
  IsArray,
  IsEnum,
  MinLength, 
  Matches,
  Min,
  Max,
  IsDateString
} from 'class-validator';
import { Transform } from 'class-transformer';

// ==================== BRANCH DTOs ====================

export class CreateBranchDto {
  @IsString()
  @MinLength(3, { message: 'Tên chi nhánh phải có ít nhất 3 ký tự' })
  name: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug chỉ được chứa chữ thường, số và dấu gạch ngang' })
  slug: string;

  @IsString()
  @Matches(/^[A-Z0-9]+$/, { message: 'Mã chi nhánh phải là chữ in hoa và số' })
  code: string;

  @IsString()
  @Matches(/^[0-9-+() ]+$/, { message: 'Số điện thoại không hợp lệ' })
  phone: string;

  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(10, { message: 'Địa chỉ phải có ít nhất 10 ký tự' })
  address: string;

  @IsString()
  @IsOptional()
  ward?: string;

  @IsString()
  @IsOptional()
  district?: string;

  @IsString()
  city: string;

  @IsString()
  @IsOptional()
  country?: string = 'Vietnam';

  @IsString()
  @IsOptional()
  postalCode?: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsOptional()
  longitude?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean = false;

  @IsDateString()
  @IsOptional()
  openingDate?: string;

  @IsObject()
  @IsOptional()
  workingHours?: any;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  amenities?: string[] = [];

  @IsString()
  @IsOptional()
  metaTitle?: string;

  @IsString()
  @IsOptional()
  metaDescription?: string;
}

export class UpdateBranchDto {
  @IsString()
  @MinLength(3)
  @IsOptional()
  name?: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  @IsOptional()
  slug?: string;

  @IsString()
  @Matches(/^[A-Z0-9]+$/)
  @IsOptional()
  code?: string;

  @IsString()
  @Matches(/^[0-9-+() ]+$/)
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(10)
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  ward?: string;

  @IsString()
  @IsOptional()
  district?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  postalCode?: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsOptional()
  longitude?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;

  @IsDateString()
  @IsOptional()
  openingDate?: string;

  @IsObject()
  @IsOptional()
  workingHours?: any;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  amenities?: string[];

  @IsString()
  @IsOptional()
  metaTitle?: string;

  @IsString()
  @IsOptional()
  metaDescription?: string;
}

export class FilterBranchDto {
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
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  search?: string; // Tìm theo tên, code, địa chỉ

  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @IsOptional()
  @Transform(({ value }) => value.toLowerCase())
  @IsString()
  order?: 'asc' | 'desc' = 'desc';
}

export class FindNearbyBranchesDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  radius?: number = 10; // km

  @IsNumber()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number = 10;
}

// ==================== BRANCH STAFF DTOs ====================

export class AddStaffToBranchDto {
  @IsString()
  userId: string;

  @IsEnum(['manager', 'stylist', 'staff'], { 
    message: 'Role phải là manager, stylist hoặc staff' 
  })
  role: 'manager' | 'stylist' | 'staff';

  @IsBoolean()
  @IsOptional()
  isPrimaryBranch?: boolean = true;
}

export class UpdateBranchStaffDto {
  @IsEnum(['manager', 'stylist', 'staff'])
  @IsOptional()
  role?: 'manager' | 'stylist' | 'staff';

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isPrimaryBranch?: boolean;
}

export class FilterBranchStaffDto {
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
  @IsEnum(['manager', 'stylist', 'staff'])
  role?: 'manager' | 'stylist' | 'staff';

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean = true;

  @IsOptional()
  @IsString()
  search?: string;
}

// ==================== BRANCH ADMIN DTOs ====================

export class AssignBranchAdminDto {
  @IsString()
  userId: string;

  @IsBoolean()
  @IsOptional()
  canManageStaff?: boolean = true;

  @IsBoolean()
  @IsOptional()
  canViewReports?: boolean = true;

  @IsBoolean()
  @IsOptional()
  canManageBookings?: boolean = true;

  @IsBoolean()
  @IsOptional()
  canManageServices?: boolean = false;
}

export class UpdateBranchAdminDto {
  @IsBoolean()
  @IsOptional()
  canManageStaff?: boolean;

  @IsBoolean()
  @IsOptional()
  canViewReports?: boolean;

  @IsBoolean()
  @IsOptional()
  canManageBookings?: boolean;

  @IsBoolean()
  @IsOptional()
  canManageServices?: boolean;
}

// ==================== BRANCH STATS DTOs ====================

export class GetBranchStatsDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(['day', 'week', 'month', 'year'])
  period?: 'day' | 'week' | 'month' | 'year' = 'month';
}