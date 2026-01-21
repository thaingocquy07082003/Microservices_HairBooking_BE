/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/require-await */
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
  Inject,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { JwtAuthGuard } from '@app/common/guards/auth.guard';
import { User } from '@app/common/decorators/user.decorator';

@Controller('auth')
export class AuthGatewayController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientKafka,
  ) {}

  async onModuleInit() {
    this.authClient.subscribeToResponseOf('auth.validate-token');
    this.authClient.subscribeToResponseOf('auth.get-user');
    await this.authClient.connect();
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerDto: any, @Ip() ipAddress: string) {
    // Forward to auth service via HTTP
    // In production, you might want to use Kafka for this too
    return registerDto;
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() verifyOtpDto: any) {
    return verifyOtpDto;
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  async resendOtp(@Body() resendOtpDto: any, @Ip() ipAddress: string) {
    return resendOtpDto;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: any,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return loginDto;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: any) {
    return { message: 'Logout' };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: any) {
    return forgotPasswordDto;
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(@User() user: any, @Body() changePasswordDto: any) {
    return changePasswordDto;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@Req() req: any) {
    const token = req.headers.authorization?.split(' ')[1];
    const result = await firstValueFrom(
      this.authClient.send('auth.validate-token', { token }),
    );
    return result;
  }

  @Get('validate')
  @UseGuards(JwtAuthGuard)
  async validateToken(@Req() req: any) {
    const token = req.headers.authorization?.split(' ')[1];
    const result = await firstValueFrom(
      this.authClient.send('auth.validate-token', { token }),
    );
    return result;
  }
}
