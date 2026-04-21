/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Ip,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  VerifyOtpDto,
  ForgotPasswordDto,
  ChangePasswordDto,
  ResendOtpDto,
  RefreshTokenDto,
} from './dto';
import { CreateStylistAccountDto } from './dto/create-stylist-account.dto'; // <-- IMPORT MỚI
import { JwtAuthGuard } from '@app/common/guards/auth.guard';
import { RolesGuard } from '@app/common/strategies/roles.guard';   // <-- IMPORT MỚI
import { Roles } from '@app/common/decorators/roles.decorator';     // <-- IMPORT MỚI
import { Role } from '@app/common/enums/role.enum';                 // <-- IMPORT MỚI
import { User } from '@app/common/decorators/user.decorator';
import { ResponseDto } from '@app/common/dto/response.dto';
import { HttpStatus as HttpStatusEnum } from '@app/common/constants/http-status.enum';
import { HttpMessage } from '@app/common/constants/http-message.enum';
import { KafkaTopics, InvoiceSendEmailEvent } from '@app/kafka';
import { MailService } from '../mail/mail.service';

interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly mailService: MailService,
  ) {}

  // ============================================================
  // CÁC ENDPOINT HIỆN CÓ (giữ nguyên)
  // ============================================================

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() registerDto: RegisterDto,
    @Ip() ipAddress: string,
  ) {
    const result = await this.authService.register(registerDto, ipAddress);
    return new ResponseDto(HttpStatusEnum.CREATED, HttpMessage.REGISTER_SUCCESS, result);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    const result = await this.authService.verifyOtp(verifyOtpDto);
    return new ResponseDto(HttpStatusEnum.OK, HttpMessage.VERIFY_OTP_SUCCESS, result);
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  async resendOtp(
    @Body() resendOtpDto: ResendOtpDto,
    @Ip() ipAddress: string,
  ) {
    const result = await this.authService.resendOtp(resendOtpDto, ipAddress);
    return new ResponseDto(HttpStatusEnum.OK, HttpMessage.RESEND_OTP_SUCCESS, result);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
  ) {
    const result = await this.authService.login(loginDto, ipAddress, userAgent);
    return new ResponseDto(HttpStatusEnum.OK, HttpMessage.LOGIN_SUCCESS, result);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: { headers: Record<string, string> }, @User() user: AuthenticatedUser) {
    const accessToken = req.headers.authorization?.split(' ')[1];
    const result = await this.authService.logout(accessToken || '', user?.id);
    return new ResponseDto(HttpStatusEnum.OK, HttpMessage.LOGOUT_SUCCESS, result);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAllDevices(@User() user: AuthenticatedUser) {
    const result = await this.authService.logoutAllDevices(user.id);
    return new ResponseDto(HttpStatusEnum.OK, 'Đã đăng xuất khỏi tất cả thiết bị', result);
  }

  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    const result = await this.authService.refreshToken(
      refreshTokenDto.userId,
      refreshTokenDto.refreshToken,
    );
    return new ResponseDto(HttpStatusEnum.OK, 'Làm mới token thành công', result);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    const result = await this.authService.forgotPassword(forgotPasswordDto);
    return new ResponseDto(HttpStatusEnum.OK, 'Yêu cầu đặt lại mật khẩu thành công', result);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @User() user: AuthenticatedUser,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    const result = await this.authService.changePassword(user.id, changePasswordDto);
    return new ResponseDto(HttpStatusEnum.OK, 'Đổi mật khẩu thành công', result);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@Req() req: { headers: Record<string, string> }) {
    const accessToken = req.headers.authorization?.split(' ')[1];
    const result = await this.authService.getCurrentUser(accessToken || '');
    return new ResponseDto(HttpStatusEnum.OK, 'Lấy thông tin người dùng thành công', result);
  }

  @Post('validate-token')
  @HttpCode(HttpStatus.OK)
  async validateTokenHttp(@Body() data: { token: string }) {
    const isValid = await this.authService.validateToken(data.token);
    return new ResponseDto(
      HttpStatusEnum.OK,
      isValid ? 'Token hợp lệ' : 'Token không hợp lệ',
      { valid: isValid },
    );
  }

  // ============================================================
  // ✅ ENDPOINT MỚI: TẠO TÀI KHOẢN STYLIST
  // POST /api/v1/auth/create-stylist
  // Chỉ admin / manager / superadmin mới được gọi
  // ============================================================
  /**
   * Tạo tài khoản stylist trực tiếp (không cần OTP).
   * - Tạo user trong Supabase Auth (email xác nhận ngay)
   * - Tạo bản ghi `profiles` với role = 'stylist'
   * - Tạo bản ghi `stylists` kèm thông tin nghề nghiệp
   *
   * Yêu cầu: Bearer token của admin / manager / superadmin
   */
  @Post('create-stylist')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.Manager, Role.SuperAdmin)
  @HttpCode(HttpStatus.CREATED)
  async createStylistAccount(
    @Body() dto: CreateStylistAccountDto,
    @User() currentUser: AuthenticatedUser,
  ) {
    const result = await this.authService.createStylistAccount(dto, currentUser.id);
    return new ResponseDto(
      HttpStatusEnum.CREATED,
      'Tạo tài khoản stylist thành công',
      result,
    );
  }

  // ============================================================
  // MICROSERVICE ENDPOINTS (giữ nguyên)
  // ============================================================

  @MessagePattern('auth.validate-token')
  async validateToken(@Payload() data: { token: string }) {
    try {
      const isValid = await this.authService.validateToken(data.token);
      if (!isValid) return { valid: false, error: 'Token không hợp lệ hoặc đã hết hạn' };
      const user = await this.authService.getCurrentUser(data.token);
      return { valid: true, user };
    } catch (error) {
      return { valid: false, error: (error as Error).message };
    }
  }

  @MessagePattern('auth.get-user')
  async getUser(@Payload() data: { userId: string }) {
    try {
      const profile = await this.authService['supabaseService'].getRecord('profiles', data.userId);
      return profile;
    } catch (error) {
      throw new BadRequestException(HttpMessage.GET_USER_ERROR + ': ' + (error as Error).message);
    }
  }

  @MessagePattern('auth.check-session')
  async checkSession(@Payload() data: { token: string }) {
    try {
      const isValid = await this.authService.validateToken(data.token);
      return { valid: isValid };
    } catch {
      return { valid: false };
    }
  }

  @MessagePattern(KafkaTopics.INVOICE_EMAIL_SEND)
  async handleInvoiceEmailSend(@Payload() event: InvoiceSendEmailEvent) {
    try {
      console.log(`[Kafka] Received invoice email event for: ${event.email}`);
      await this.mailService.sendInvoiceEmailFromEvent(event);
      return { success: true, message: `Invoice email sent to ${event.email}` };
    } catch (error) {
      console.error(`[Kafka] Failed to send invoice email:`, error);
      return { success: false, error: (error as Error).message };
    }
  }
}