import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsOptional,
  IsArray,
  IsInt,
  Min,
} from 'class-validator';

/**
 * DTO tạo tài khoản stylist trực tiếp (không cần OTP).
 * Chỉ dành cho admin / manager / superadmin.
 */
export class CreateStylistAccountDto {
  // ── Thông tin tài khoản ──────────────────────────────────────
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email: string;

  @IsString({ message: 'Mật khẩu phải là chuỗi' })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  password: string;

  // ── Thông tin cá nhân (profiles) ────────────────────────────
  @IsString({ message: 'Họ tên phải là chuỗi' })
  @IsNotEmpty({ message: 'Họ tên không được để trống' })
  fullName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  // ── Thông tin nghề nghiệp (stylists table) ───────────────────
  @IsOptional()
  @IsInt({ message: 'Số năm kinh nghiệm phải là số nguyên' })
  @Min(0, { message: 'Số năm kinh nghiệm không được âm' })
  experience?: number;

  @IsOptional()
  @IsArray({ message: 'Chuyên môn phải là mảng' })
  @IsString({ each: true, message: 'Mỗi chuyên môn phải là chuỗi' })
  specialties?: string[];
}

export class CreateStylistAccountResponseDto {
  userId: string;
  stylistId: string;
  email: string;
  fullName: string;
  role: string;
  message: string;
}