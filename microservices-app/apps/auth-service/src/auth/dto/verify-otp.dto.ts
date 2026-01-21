import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
export class VerifyOtpDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email: string;

  @IsString({ message: 'Mã OTP phải là chuỗi' })
  @IsNotEmpty({ message: 'Mã OTP không được để trống' })
  @MinLength(6, { message: 'Mã OTP phải có 6 ký tự' })
  otp: string;
}

export class VerifyOtpResponseDto {
  success: boolean;
  message: string;
  accessToken?: string;
  refreshToken?: string;
}