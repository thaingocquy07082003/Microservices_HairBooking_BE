import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class RefreshTokenDto {
  @IsUUID('4', { message: 'User ID phải là UUID hợp lệ' })
  @IsNotEmpty({ message: 'User ID không được để trống' })
  userId: string;

  @IsString({ message: 'Refresh token phải là chuỗi' })
  @IsNotEmpty({ message: 'Refresh token không được để trống' })
  refreshToken: string;
}
