/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  OnModuleInit,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { RedisService } from '@app/redis';
import {
  KafkaService,
  KafkaTopics,
  UserRegisteredEvent,
  UserVerifiedEvent,
  UserLoggedInEvent,
} from '@app/kafka';
import { MailService } from '../mail/mail.service';
import {
  RegisterDto,
  LoginDto,
  VerifyOtpDto,
  ForgotPasswordDto,
  ChangePasswordDto,
  ResendOtpDto,
} from './dto';
import { CreateStylistAccountDto } from './dto/create-stylist-account.dto'; // <-- IMPORT MỚI
import { Role } from '@app/common/enums/role.enum';
import { JwtService } from '@nestjs/jwt';

interface TempUserData {
  userId: string;
  email: string;
  fullName: string;
  phone?: string;
  role: string;
}

interface ProfileData {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: string;
  verified: boolean;
  created_at: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly redisService: RedisService,
    private readonly kafkaService: KafkaService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
  ) {}

  onModuleInit() {
    console.log('AuthService initialized');
  }

  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // ============================================================
  // REGISTER (giữ nguyên)
  // ============================================================
  async register(registerDto: RegisterDto, ipAddress?: string) {
    const { email, password, fullName, phone } = registerDto;

    const rateLimitKey = `register:${ipAddress || email}`;
    const attempts = await this.redisService.incrementCounter(rateLimitKey, 3600);
    if (attempts > 5) {
      throw new BadRequestException('Quá nhiều lần đăng ký. Vui lòng thử lại sau 1 giờ.');
    }

    try {
      const { user } = await this.supabaseService.signUp(email, password, {
        full_name: fullName,
        phone,
        role: Role.Customer,
      });

      if (!user) throw new BadRequestException('Không thể tạo tài khoản');

      const otp = this.generateOTP();
      await this.redisService.setOtp(email, otp, 3600);
      await this.redisService.set(`temp:user:${email}`, {
        userId: user.id,
        email,
        fullName,
        phone,
        role: Role.Customer,
      }, 600);

      await this.mailService.sendOtpEmail(email, otp, fullName);

      this.kafkaService.emit<UserRegisteredEvent>(KafkaTopics.USER_REGISTERED, {
        userId: user.id,
        email,
        fullName,
        phone,
        timestamp: new Date(),
      });

      return {
        userId: user.id,
        email,
        message: 'Đăng ký thành công. Vui lòng kiểm tra email để nhận mã OTP (có hiệu lực trong 60 phút).',
        otpExpiresIn: 3600,
      };
    } catch (error: unknown) {
      const err = error as Error & { code?: string; status?: number };
      if (
        err.message?.includes('already registered') ||
        err.message?.includes('already been registered') ||
        err.message?.includes('User already registered')
      ) {
        throw new ConflictException('Email đã được đăng ký');
      }
      if (err.code === 'over_email_send_rate_limit' || err.status === 429) {
        throw new BadRequestException('Đã vượt giới hạn gửi email. Vui lòng thử lại sau vài phút.');
      }
      throw error;
    }
  }

  // ============================================================
  // VERIFY OTP (giữ nguyên)
  // ============================================================
  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const { email, otp } = verifyOtpDto;

    const storedOtp = await this.redisService.getOtp(email);
    if (!storedOtp) {
      throw new BadRequestException('Mã OTP đã hết hạn (60 phút) hoặc không tồn tại. Vui lòng yêu cầu gửi lại OTP.');
    }
    if (storedOtp !== otp) {
      throw new BadRequestException('Mã OTP không chính xác');
    }

    const tempUserData = await this.redisService.get<TempUserData>(`temp:user:${email}`);
    if (!tempUserData) {
      throw new BadRequestException('Phiên đăng ký đã hết hạn. Vui lòng đăng ký lại.');
    }

    try {
      await this.supabaseService.updateUserById(tempUserData.userId, {
        email_confirm: true,
        user_metadata: {
          full_name: tempUserData.fullName,
          phone: tempUserData.phone,
          role: tempUserData.role,
          verified: true,
        },
      });

      await this.supabaseService.insertRecord('profiles', {
        id: tempUserData.userId,
        email,
        full_name: tempUserData.fullName,
        phone: tempUserData.phone,
        role: tempUserData.role,
        verified: true,
        created_at: new Date().toISOString(),
      });

      await this.redisService.deleteOtp(email);
      await this.redisService.delete(`temp:user:${email}`);

      try {
        await this.mailService.sendAccountVerificationSuccess(email, tempUserData.fullName);
      } catch (mailError) {
        console.warn('Failed to send welcome email:', mailError);
      }

      this.kafkaService.emit<UserVerifiedEvent>(KafkaTopics.USER_VERIFIED, {
        userId: tempUserData.userId,
        email,
        timestamp: new Date(),
      });

      return {
        success: true,
        message: 'Xác thực tài khoản thành công! Bạn có thể đăng nhập ngay.',
        userId: tempUserData.userId,
      };
    } catch (error: unknown) {
      const err = error as Error;
      console.error('OTP verification error:', err);
      throw new BadRequestException('Xác thực thất bại: ' + err.message);
    }
  }

  // ============================================================
  // RESEND OTP (giữ nguyên)
  // ============================================================
  async resendOtp(resendOtpDto: ResendOtpDto, ipAddress?: string) {
    const { email } = resendOtpDto;

    const rateLimitKey = `resend-otp:${ipAddress || email}`;
    const attempts = await this.redisService.incrementCounter(rateLimitKey, 300);
    if (attempts > 3) {
      throw new BadRequestException('Quá nhiều lần gửi lại OTP. Vui lòng thử lại sau 5 phút.');
    }

    const tempUserData = await this.redisService.get<TempUserData>(`temp:user:${email}`);
    if (!tempUserData) {
      throw new BadRequestException('Không tìm thấy yêu cầu đăng ký. Vui lòng đăng ký lại.');
    }

    const otp = this.generateOTP();
    await this.redisService.setOtp(email, otp, 120);
    await this.mailService.sendOtpEmail(email, otp, tempUserData.fullName);

    return {
      message: 'Mã OTP mới đã được gửi đến email của bạn (có hiệu lực trong 2 phút)',
      otpExpiresIn: 120,
    };
  }

  // ============================================================
  // LOGIN (giữ nguyên)
  // ============================================================
  async login(loginDto: LoginDto, ipAddress?: string, userAgent?: string) {
    const { email, password } = loginDto;

    const rateLimitKey = `login:${ipAddress || email}`;
    const attempts = await this.redisService.incrementCounter(rateLimitKey, 900);
    if (attempts > 25) {
      throw new UnauthorizedException('Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 15 phút.');
    }

    try {
      const { session, user } = await this.supabaseService.signInWithPassword(email, password);

      if (!session || !user) {
        throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
      }

      if (!user.email_confirmed_at) {
        throw new UnauthorizedException('Tài khoản chưa được xác thực. Vui lòng kiểm tra email.');
      }

      let profile: ProfileData;
      try {
        profile = (await this.supabaseService.getRecord('profiles', user.id)) as ProfileData;
      } catch (profileError) {
        console.error('Profile not found for user:', user.id, profileError);
        try {
          const roleValue = user.user_metadata?.role || 'customer';
          profile = (await this.supabaseService.insertRecord('profiles', {
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || email.split('@')[0],
            phone: user.user_metadata?.phone || null,
            role: roleValue.toLowerCase(),
            verified: true,
          })) as ProfileData;
        } catch (insertError) {
          console.error('Failed to auto-create profile:', insertError);
          throw new UnauthorizedException('Không thể tạo hồ sơ người dùng. Vui lòng liên hệ hỗ trợ.');
        }
      }

      const payload = { sub: profile.id, email: profile.email, role: profile.role };
      const accessToken = this.jwtService.sign(payload, { expiresIn: '24h' });
      const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

      await this.redisService.setSession(accessToken, { userId: user.id, email: user.email, role: profile.role }, 86400);
      await this.redisService.setRefreshToken(user.id, refreshToken, 604800);
      await this.redisService.addUserSession(user.id, accessToken);

      this.kafkaService.emit<UserLoggedInEvent>(KafkaTopics.USER_LOGGED_IN, {
        userId: user.id,
        email: user.email || email,
        timestamp: new Date(),
        ipAddress,
        userAgent,
      });

      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          fullName: profile.full_name,
          role: profile.role,
        },
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }
  }

  // ============================================================
  // LOGOUT (giữ nguyên)
  // ============================================================
  async logout(accessToken: string, userId?: string) {
    try {
      await this.supabaseService.signOut(accessToken);
      await this.redisService.deleteSession(accessToken);
      await this.redisService.addToBlacklist(accessToken, 86400);

      if (userId) {
        await this.redisService.removeUserSession(userId, accessToken);
        await this.redisService.deleteRefreshToken(userId);
      }

      return { message: 'Đăng xuất thành công' };
    } catch {
      throw new BadRequestException('Đăng xuất thất bại');
    }
  }

  async logoutAllDevices(userId: string) {
    try {
      const sessions = await this.redisService.getUserSessions(userId);
      for (const sessionToken of sessions) {
        await this.redisService.deleteSession(sessionToken);
        await this.redisService.addToBlacklist(sessionToken, 86400);
      }
      await this.redisService.clearUserSessions(userId);
      await this.redisService.deleteRefreshToken(userId);

      return { message: 'Đã đăng xuất khỏi tất cả thiết bị', sessionsInvalidated: sessions.length };
    } catch {
      throw new BadRequestException('Đăng xuất thất bại');
    }
  }

  // ============================================================
  // VALIDATE TOKEN (giữ nguyên)
  // ============================================================
  async validateToken(accessToken: string): Promise<boolean> {
    const isBlacklisted = await this.redisService.isBlacklisted(accessToken);
    if (isBlacklisted) return false;
    const session = await this.redisService.getSession(accessToken);
    return !!session;
  }

  // ============================================================
  // FORGOT PASSWORD (giữ nguyên)
  // ============================================================
  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;
    try {
      const profiles = await this.supabaseService.queryRecords('profiles', { filters: { email } });
      if (!profiles || profiles.length === 0) {
        return { message: 'Nếu email tồn tại, link đặt lại mật khẩu đã được gửi' };
      }
      await this.supabaseService.resetPasswordForEmail(email);
      return { message: 'Link đặt lại mật khẩu đã được gửi đến email của bạn' };
    } catch {
      return { message: 'Nếu email tồn tại, link đặt lại mật khẩu đã được gửi' };
    }
  }

  // ============================================================
  // CHANGE PASSWORD (giữ nguyên)
  // ============================================================
  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const { oldPassword, newPassword } = changePasswordDto;
    try {
      const profile = (await this.supabaseService.getRecord('profiles', userId)) as ProfileData;
      const { error } = await this.supabaseService.getClient().auth.signInWithPassword({
        email: profile.email,
        password: oldPassword,
      });
      if (error) throw new BadRequestException('Mật khẩu cũ không chính xác');

      await this.supabaseService.updateUserById(userId, { password: newPassword });
      await this.mailService.sendPasswordChangedEmail(profile.email, profile.full_name);

      return { message: 'Đổi mật khẩu thành công' };
    } catch (error: unknown) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Đổi mật khẩu thất bại: ' + (error as Error).message);
    }
  }

  // ============================================================
  // GET CURRENT USER (giữ nguyên)
  // ============================================================
  async getCurrentUser(accessToken: string) {
    try {
      const isValid = await this.validateToken(accessToken);
      if (!isValid) throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');

      const user = await this.supabaseService.getUser(accessToken);
      const profile = (await this.supabaseService.getRecord('profiles', user.id)) as ProfileData;

      return {
        id: user.id,
        email: user.email,
        fullName: profile.full_name,
        phone: profile.phone,
        role: profile.role,
        verified: profile.verified,
        createdAt: profile.created_at,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Token không hợp lệ');
    }
  }

  // ============================================================
  // REFRESH TOKEN (giữ nguyên)
  // ============================================================
  async refreshToken(userId: string, refreshToken: string) {
    try {
      const storedRefreshToken = await this.redisService.getRefreshToken(userId);
      if (!storedRefreshToken || storedRefreshToken !== refreshToken) {
        throw new UnauthorizedException('Refresh token không hợp lệ');
      }

      const { session, user } = await this.supabaseService.refreshSession(refreshToken);
      if (!session || !user) throw new UnauthorizedException('Không thể làm mới session');

      const profile = (await this.supabaseService.getRecord('profiles', user.id)) as ProfileData;

      await this.redisService.setSession(session.access_token, { userId: user.id, email: user.email, role: profile.role }, 86400);
      await this.redisService.setRefreshToken(user.id, session.refresh_token, 604800);
      await this.redisService.addUserSession(user.id, session.access_token);

      return {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        user: {
          id: user.id,
          email: user.email,
          fullName: profile.full_name,
          role: profile.role,
        },
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Không thể làm mới token');
    }
  }

  // ============================================================
  // ✅ TẠO TÀI KHOẢN STYLIST (MỚI)
  // ============================================================
  /**
   * Tạo tài khoản stylist trực tiếp - không qua OTP.
   * Đồng thời tạo bản ghi trong cả `profiles` lẫn `stylists`.
   *
   * @param dto     Dữ liệu tài khoản stylist
   * @param createdByUserId  UUID của admin/manager đang thực hiện tạo
   */
  async createStylistAccount(
    dto: CreateStylistAccountDto,
    createdByUserId: string,
  ) {
    const {
      email,
      password,
      fullName,
      phone,
      avatarUrl,
      experience,
      specialties,
    } = dto;

    // ── 1. Kiểm tra email trùng lặp ─────────────────────────────
    const existing = await this.supabaseService.queryRecords('profiles', {
      filters: { email },
    });
    if (existing && existing.length > 0) {
      throw new ConflictException('Email đã được sử dụng bởi tài khoản khác');
    }

    // ── 2. Tạo user Auth (email xác nhận ngay) ──────────────────
    let authUser: { id: string };
    try {
      const result = await this.supabaseService.signUp(email, password, {
        full_name: fullName,
        phone,
        role: Role.HairStylist, // 'stylist'
      });
      authUser = result.user as { id: string };
      if (!authUser) throw new BadRequestException('Không thể tạo tài khoản Supabase');

      // Xác nhận email ngay - stylist đăng nhập được luôn
      await this.supabaseService.updateUserById(authUser.id, {
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          phone,
          role: Role.HairStylist,
          verified: true,
        },
      });
    } catch (error: unknown) {
      const err = error as Error;
      if (
        err.message?.includes('already registered') ||
        err.message?.includes('User already registered')
      ) {
        throw new ConflictException('Email đã được đăng ký');
      }
      throw error;
    }

    // ── 3. Tạo bản ghi profiles ─────────────────────────────────
    let profile: { id: string };
    try {
      profile = (await this.supabaseService.insertRecord('profiles', {
        id: authUser.id,
        email,
        full_name: fullName,
        phone: phone ?? null,
        avatar_url: avatarUrl ?? null,
        role: Role.HairStylist, // 'stylist'
        verified: true,
        created_at: new Date().toISOString(),
      })) as typeof profile;
    } catch (error: unknown) {
      // Rollback: xóa user Auth
      try { await this.supabaseService.deleteUser(authUser.id); } catch { /* ignore */ }
      throw new BadRequestException(
        'Tạo profile thất bại: ' + (error as Error).message,
      );
    }

    // ── 4. Tạo bản ghi stylists ─────────────────────────────────
    let stylistRecord: { id: string };
    try {
      stylistRecord = (await this.supabaseService.insertRecord('stylists', {
        user_id: authUser.id,
        full_name: fullName,
        avatar_url: avatarUrl ?? null,
        experience: experience ?? 0,
        specialties: specialties ?? [],
        is_available: true,
        rating: 0.00,
        total_bookings: 0,
        created_at: new Date().toISOString(),
      })) as typeof stylistRecord;
    } catch (error: unknown) {
      // Rollback: xóa profile + user Auth
      try { await this.supabaseService.deleteUser(authUser.id); } catch { /* ignore */ }
      throw new BadRequestException(
        'Tạo hồ sơ stylist thất bại: ' + (error as Error).message,
      );
    }

    // ── 5. Kafka event ───────────────────────────────────────────
    this.kafkaService.emit<UserRegisteredEvent>(KafkaTopics.USER_REGISTERED, {
      userId: authUser.id,
      email,
      fullName,
      phone,
      role: Role.HairStylist,
      timestamp: new Date(),
    });

    return {
      userId: authUser.id,
      stylistId: stylistRecord.id,
      email,
      fullName,
      role: Role.HairStylist,
      createdBy: createdByUserId,
      message: 'Tạo tài khoản stylist thành công. Tài khoản có thể đăng nhập ngay.',
    };
  }
}