/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { InvoiceDetailed } from '@app/common/entities/invoice.entity';
import { InvoiceSendEmailEvent } from '@app/kafka';

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

  async sendInvoiceEmail(email: string, invoice: InvoiceDetailed): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: `Hóa đơn ${invoice.invoiceNumber} - ${invoice.status === 'paid' ? 'Đã thanh toán' : 'Chờ thanh toán'}`,
        template: './invoice',
        context: {
          invoiceNumber: invoice.invoiceNumber,
          customerName: invoice.customerName,
          status: invoice.status === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán',
          isPaid: invoice.status === 'paid',
          items: invoice.items,
          subtotal: invoice.subtotal.toLocaleString('vi-VN'),
          discountAmount: invoice.discountAmount.toLocaleString('vi-VN'),
          taxAmount: invoice.taxAmount.toLocaleString('vi-VN'),
          totalAmount: invoice.totalAmount.toLocaleString('vi-VN'),
          paymentMethod: invoice.paymentMethod,
          paidAt: invoice.paidAt?.toLocaleString('vi-VN'),
          branchName: invoice.branchName,
          stylistName: invoice.stylistName,
          createdAt: invoice.createdAt.toLocaleString('vi-VN'),
        },
      });
      console.log(`Invoice email sent to ${email}`);
    } catch (error) {
      console.error(`Failed to send invoice email:`, error);
      throw error;
    }
  }

  async sendInvoiceEmailFromEvent(event: InvoiceSendEmailEvent): Promise<void> {
    try {
      const isPaid = event.status === 'paid';
      await this.mailerService.sendMail({
        to: event.email,
        subject: `Hóa đơn ${event.invoiceNumber} - ${isPaid ? 'Đã thanh toán' : 'Chờ thanh toán'}`,
        template: './invoice',
        context: {
          invoiceNumber: event.invoiceNumber,
          customerName: event.customerName,
          status: isPaid ? 'Đã thanh toán' : 'Chưa thanh toán',
          isPaid,
          items: event.items.map(item => ({
            ...item,
            unitPrice: item.unitPrice.toLocaleString('vi-VN'),
            totalPrice: item.totalPrice.toLocaleString('vi-VN'),
          })),
          subtotal: event.subtotal.toLocaleString('vi-VN'),
          discountAmount: event.discountAmount.toLocaleString('vi-VN'),
          taxAmount: event.taxAmount.toLocaleString('vi-VN'),
          totalAmount: event.totalAmount.toLocaleString('vi-VN'),
          paymentMethod: event.paymentMethod,
          paidAt: event.paidAt ? new Date(event.paidAt).toLocaleString('vi-VN') : null,
          branchName: event.branchName,
          stylistName: event.stylistName,
          createdAt: new Date(event.createdAt).toLocaleString('vi-VN'),
        },
      });
      console.log(`Invoice email sent to ${event.email} via Kafka event`);
    } catch (error) {
      console.error(`Failed to send invoice email from Kafka event:`, error);
      throw error;
    }
  }
}