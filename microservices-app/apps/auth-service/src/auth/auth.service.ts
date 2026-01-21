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
import { Role } from '@app/common/enums/role.enum';

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
  ) {}

  onModuleInit() {
    // Kafka service handles its own connection
    console.log('AuthService initialized');
  }

  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async register(registerDto: RegisterDto, ipAddress?: string) {
    const { email, password, fullName, phone } = registerDto;

    // Check rate limiting
    const rateLimitKey = `register:${ipAddress || email}`;
    const attempts = await this.redisService.incrementCounter(
      rateLimitKey,
      3600,
    );
    if (attempts > 5) {
      throw new BadRequestException(
        'Quá nhiều lần đăng ký. Vui lòng thử lại sau 1 giờ.',
      );
    }

    try {
      // Create user in Supabase Auth
      const { user } = await this.supabaseService.signUp(email, password, {
        full_name: fullName,
        phone,
        role: Role.Customer,
      });

      if (!user) {
        throw new BadRequestException('Không thể tạo tài khoản');
      }

      // Generate and store OTP
      const otp = this.generateOTP();
      await this.redisService.setOtp(email, otp, 120); // 2 minutes

      // Store temporary user data
      await this.redisService.set(
        `temp:user:${email}`,
        {
          userId: user.id,
          email,
          fullName,
          phone,
          role: Role.Customer,
        },
        600, // 10 minutes
      );

      // Send OTP email
      await this.mailService.sendOtpEmail(email, otp, fullName);

      // Emit event to Kafka
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
        message:
          'Đăng ký thành công. Vui lòng kiểm tra email để xác thực tài khoản.',
      };
    } catch (error: unknown) {
      const err = error as Error;
      if (err.message?.includes('already registered')) {
        throw new ConflictException('Email đã được đăng ký');
      }
      throw error;
    }
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const { email, otp } = verifyOtpDto;

    // Get OTP from Redis
    const storedOtp = await this.redisService.getOtp(email);

    if (!storedOtp) {
      throw new BadRequestException('Mã OTP đã hết hạn hoặc không tồn tại');
    }

    if (storedOtp !== otp) {
      throw new BadRequestException('Mã OTP không chính xác');
    }

    // Get temporary user data
    const tempUserData = await this.redisService.get<TempUserData>(
      `temp:user:${email}`,
    );

    if (!tempUserData) {
      throw new BadRequestException('Phiên đăng ký đã hết hạn');
    }

    try {
      // Verify email in Supabase
      await this.supabaseService.verifyOtp(email, otp, 'email');

      // Update user metadata to mark as verified
      await this.supabaseService.updateUserById(tempUserData.userId, {
        email_confirmed_at: new Date().toISOString(),
        user_metadata: {
          ...tempUserData,
          verified: true,
        },
      });

      // Create user profile in database
      await this.supabaseService.insertRecord('profiles', {
        id: tempUserData.userId,
        email,
        full_name: tempUserData.fullName,
        phone: tempUserData.phone,
        role: tempUserData.role,
        verified: true,
        created_at: new Date().toISOString(),
      });

      // Clean up
      await this.redisService.deleteOtp(email);
      await this.redisService.delete(`temp:user:${email}`);

      // Send welcome email
      await this.mailService.sendAccountVerificationSuccess(
        email,
        tempUserData.fullName,
      );

      // Emit event
      this.kafkaService.emit<UserVerifiedEvent>(KafkaTopics.USER_VERIFIED, {
        userId: tempUserData.userId,
        email,
        timestamp: new Date(),
      });

      return {
        success: true,
        message: 'Xác thực tài khoản thành công',
      };
    } catch (error: unknown) {
      const err = error as Error;
      throw new BadRequestException('Xác thực thất bại: ' + err.message);
    }
  }

  async resendOtp(resendOtpDto: ResendOtpDto, ipAddress?: string) {
    const { email } = resendOtpDto;

    // Rate limiting
    const rateLimitKey = `resend-otp:${ipAddress || email}`;
    const attempts = await this.redisService.incrementCounter(
      rateLimitKey,
      300,
    );
    if (attempts > 3) {
      throw new BadRequestException(
        'Quá nhiều lần gửi lại OTP. Vui lòng thử lại sau 5 phút.',
      );
    }

    // Check if user exists in temp storage
    const tempUserData = await this.redisService.get<TempUserData>(
      `temp:user:${email}`,
    );

    if (!tempUserData) {
      throw new BadRequestException('Không tìm thấy yêu cầu đăng ký');
    }

    // Generate new OTP
    const otp = this.generateOTP();
    await this.redisService.setOtp(email, otp, 120);

    // Send OTP email
    await this.mailService.sendOtpEmail(email, otp, tempUserData.fullName);

    return {
      message: 'Mã OTP mới đã được gửi đến email của bạn',
    };
  }

  async login(loginDto: LoginDto, ipAddress?: string, userAgent?: string) {
    const { email, password } = loginDto;

    // Rate limiting
    const rateLimitKey = `login:${ipAddress || email}`;
    const attempts = await this.redisService.incrementCounter(
      rateLimitKey,
      900,
    );
    if (attempts > 5) {
      throw new UnauthorizedException(
        'Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 15 phút.',
      );
    }

    try {
      // Sign in with Supabase
      const { session, user } = await this.supabaseService.signInWithPassword(
        email,
        password,
      );

      if (!session || !user) {
        throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
      }

      // Check if email is verified
      if (!user.email_confirmed_at) {
        throw new UnauthorizedException(
          'Tài khoản chưa được xác thực. Vui lòng kiểm tra email.',
        );
      }

      // Get user profile
      const profile = (await this.supabaseService.getRecord(
        'profiles',
        user.id,
      )) as ProfileData;

      // Store session in Redis
      await this.redisService.setSession(
        session.access_token,
        {
          userId: user.id,
          email: user.email,
          role: profile.role,
        },
        86400, // 24 hours
      );

      // Store refresh token in Redis
      await this.redisService.setRefreshToken(
        user.id,
        session.refresh_token,
        604800, // 7 days
      );

      // Track user session
      await this.redisService.addUserSession(user.id, session.access_token);

      // Send login notification
      await this.mailService.sendLoginNotification(
        email,
        profile.full_name,
        ipAddress || 'Unknown',
        userAgent || 'Unknown',
      );

      // Emit login event
      this.kafkaService.emit<UserLoggedInEvent>(KafkaTopics.USER_LOGGED_IN, {
        userId: user.id,
        email: user.email || email,
        timestamp: new Date(),
        ipAddress,
        userAgent,
      });

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
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }
  }

  async logout(accessToken: string, userId?: string) {
    try {
      await this.supabaseService.signOut(accessToken);
      await this.redisService.deleteSession(accessToken);

      // Add token to blacklist
      await this.redisService.addToBlacklist(accessToken, 86400);

      // Remove from user sessions if userId provided
      if (userId) {
        await this.redisService.removeUserSession(userId, accessToken);
        await this.redisService.deleteRefreshToken(userId);
      }

      return {
        message: 'Đăng xuất thành công',
      };
    } catch {
      throw new BadRequestException('Đăng xuất thất bại');
    }
  }

  async logoutAllDevices(userId: string) {
    try {
      // Get all user sessions
      const sessions = await this.redisService.getUserSessions(userId);

      // Invalidate all sessions
      for (const sessionToken of sessions) {
        await this.redisService.deleteSession(sessionToken);
        await this.redisService.addToBlacklist(sessionToken, 86400);
      }

      // Clear all user sessions
      await this.redisService.clearUserSessions(userId);
      await this.redisService.deleteRefreshToken(userId);

      return {
        message: 'Đã đăng xuất khỏi tất cả thiết bị',
        sessionsInvalidated: sessions.length,
      };
    } catch {
      throw new BadRequestException('Đăng xuất thất bại');
    }
  }

  async validateToken(accessToken: string): Promise<boolean> {
    // Check if token is blacklisted
    const isBlacklisted = await this.redisService.isBlacklisted(accessToken);
    if (isBlacklisted) {
      return false;
    }

    // Check if session exists
    const session = await this.redisService.getSession(accessToken);
    return !!session;
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;

    try {
      // Get user profile
      const profiles = await this.supabaseService.queryRecords('profiles', {
        filters: { email },
      });

      if (!profiles || profiles.length === 0) {
        // Don't reveal if email exists
        return {
          message: 'Nếu email tồn tại, link đặt lại mật khẩu đã được gửi',
        };
      }

      // Send reset password email through Supabase
      await this.supabaseService.resetPasswordForEmail(email);

      return {
        message: 'Link đặt lại mật khẩu đã được gửi đến email của bạn',
      };
    } catch {
      return {
        message: 'Nếu email tồn tại, link đặt lại mật khẩu đã được gửi',
      };
    }
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const { oldPassword, newPassword } = changePasswordDto;

    try {
      // Verify old password by attempting to sign in
      const profile = (await this.supabaseService.getRecord(
        'profiles',
        userId,
      )) as ProfileData;

      const { error } = await this.supabaseService
        .getClient()
        .auth.signInWithPassword({
          email: profile.email,
          password: oldPassword,
        });

      if (error) {
        throw new BadRequestException('Mật khẩu cũ không chính xác');
      }

      // Update password
      await this.supabaseService.updateUserById(userId, {
        password: newPassword,
      });

      // Send notification email
      await this.mailService.sendPasswordChangedEmail(
        profile.email,
        profile.full_name,
      );

      return {
        message: 'Đổi mật khẩu thành công',
      };
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      const err = error as Error;
      throw new BadRequestException('Đổi mật khẩu thất bại: ' + err.message);
    }
  }

  async getCurrentUser(accessToken: string) {
    try {
      // Check if token is valid
      const isValid = await this.validateToken(accessToken);
      if (!isValid) {
        throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
      }

      const user = await this.supabaseService.getUser(accessToken);
      const profile = (await this.supabaseService.getRecord(
        'profiles',
        user.id,
      )) as ProfileData;

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
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Token không hợp lệ');
    }
  }

  async refreshToken(userId: string, refreshToken: string) {
    try {
      // Verify refresh token from Redis
      const storedRefreshToken =
        await this.redisService.getRefreshToken(userId);

      if (!storedRefreshToken || storedRefreshToken !== refreshToken) {
        throw new UnauthorizedException('Refresh token không hợp lệ');
      }

      // Refresh session with Supabase
      const { session, user } =
        await this.supabaseService.refreshSession(refreshToken);

      if (!session || !user) {
        throw new UnauthorizedException('Không thể làm mới session');
      }

      // Get user profile
      const profile = (await this.supabaseService.getRecord(
        'profiles',
        user.id,
      )) as ProfileData;

      // Update session in Redis
      await this.redisService.setSession(
        session.access_token,
        {
          userId: user.id,
          email: user.email,
          role: profile.role,
        },
        86400,
      );

      // Update refresh token
      await this.redisService.setRefreshToken(
        user.id,
        session.refresh_token,
        604800,
      );

      // Track new session
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
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Không thể làm mới token');
    }
  }
}
