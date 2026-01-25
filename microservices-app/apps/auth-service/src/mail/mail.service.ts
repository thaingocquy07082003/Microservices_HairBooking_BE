/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  async sendOtpEmail(email: string, otp: string, fullName?: string): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Mã xác thực OTP - Xác nhận đăng ký tài khoản',
        template: './confirmation',
        context: {
          otp,
          fullName: fullName || 'Khách hàng',
        },
      });
      console.log(`OTP email sent successfully to ${email}`);
    } catch (error) {
      console.error(`Failed to send OTP email to ${email}:`, error);
      throw error;
    }
  }

  async sendWelcomeEmail(email: string, fullName: string): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Chào mừng bạn đến với hệ thống!',
        template: './welcome',
        context: {
          fullName,
          loginUrl: `${this.configService.get('APP_URL')}/login`,
        },
      });
      console.log(`Welcome email sent successfully to ${email}`);
    } catch (error) {
      console.error(`Failed to send welcome email to ${email}:`, error);
      throw error;
    }
  }

  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
    fullName: string,
  ): Promise<void> {
    try {
      const resetUrl = `${this.configService.get('APP_URL')}/reset-password?token=${resetToken}`;
      
      await this.mailerService.sendMail({
        to: email,
        subject: 'Yêu cầu đặt lại mật khẩu',
        template: './reset-password',
        context: {
          fullName,
          resetUrl,
        },
      });
      console.log(`Password reset email sent successfully to ${email}`);
    } catch (error) {
      console.error(`Failed to send password reset email to ${email}:`, error);
      throw error;
    }
  }

  async sendPasswordChangedEmail(email: string, fullName: string): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Mật khẩu của bạn đã được thay đổi',
        template: './password-changed',
        context: {
          fullName,
          supportEmail: this.configService.get('SUPPORT_EMAIL'),
        },
      });
      console.log(`Password changed email sent successfully to ${email}`);
    } catch (error) {
      console.error(`Failed to send password changed email to ${email}:`, error);
      throw error;
    }
  }

  async sendAccountVerificationSuccess(
    email: string,
    fullName: string,
  ): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Tài khoản của bạn đã được xác thực thành công',
        template: './verification-success',
        context: {
          fullName,
          loginUrl: `${this.configService.get('APP_URL')}/login`,
        },
      });
      console.log(`Verification success email sent to ${email}`);
    } catch (error) {
      console.error(`Failed to send verification success email to ${email}:`, error);
      throw error;
    }
  }
}