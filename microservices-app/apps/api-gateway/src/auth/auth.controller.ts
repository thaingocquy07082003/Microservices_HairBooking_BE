/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
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
  HttpException,
  Optional,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { JwtAuthGuard } from '@app/common/guards/auth.guard';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthGatewayController {
  private authServiceUrl: string;

  constructor(
    @Optional() @Inject('AUTH_SERVICE') private readonly authClient: ClientKafka,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.authServiceUrl =
      this.configService.get<string>('AUTH_SERVICE_URL') ||
      'http://localhost:3001/api/v1';
  }

  async onModuleInit() {
    // Only connect to Kafka if client is available
    if (this.authClient) {
      try {
        this.authClient.subscribeToResponseOf('auth.validate-token');
        this.authClient.subscribeToResponseOf('auth.get-user');
        await this.authClient.connect();
        console.log('✅ Kafka client connected');
      } catch (error) {
        console.warn('⚠️ Kafka not available, using HTTP only');
      }
    }
  }

  // Helper method to forward requests to Auth Service
  private async forwardToAuthService<T>(
    method: 'get' | 'post',
    endpoint: string,
    data?: any,
    headers?: Record<string, string>,
  ): Promise<T> {
    try {
      const url = `${this.authServiceUrl}${endpoint}`;
      const config = { headers: headers || {} };

      const response =
        method === 'get'
          ? await firstValueFrom(this.httpService.get<T>(url, config))
          : await firstValueFrom(this.httpService.post<T>(url, data, config));

      return response.data;
    } catch (error: any) {
      // Forward error from auth service
      if (error.response) {
        throw new HttpException(
          error.response.data,
          error.response.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      throw new HttpException(
        'Auth Service không khả dụng',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerDto: any, @Ip() ipAddress: string) {
    return this.forwardToAuthService('post', '/auth/register', registerDto, {
      'X-Forwarded-For': ipAddress,
    });
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() verifyOtpDto: any) {
    return this.forwardToAuthService('post', '/auth/verify-otp', verifyOtpDto);
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  async resendOtp(@Body() resendOtpDto: any, @Ip() ipAddress: string) {
    return this.forwardToAuthService('post', '/auth/resend-otp', resendOtpDto, {
      'X-Forwarded-For': ipAddress,
    });
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: any,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.forwardToAuthService('post', '/auth/login', loginDto, {
      'X-Forwarded-For': ipAddress,
      'User-Agent': userAgent,
    });
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: { headers: Record<string, string> }) {
    const authorization = req.headers.authorization;
    return this.forwardToAuthService(
      'post',
      '/auth/logout',
      {},
      { authorization },
    );
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAllDevices(@Req() req: { headers: Record<string, string> }) {
    const authorization = req.headers.authorization;
    return this.forwardToAuthService(
      'post',
      '/auth/logout-all',
      {},
      { authorization },
    );
  }

  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body() refreshTokenDto: any) {
    return this.forwardToAuthService(
      'post',
      '/auth/refresh-token',
      refreshTokenDto,
    );
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: any) {
    return this.forwardToAuthService(
      'post',
      '/auth/forgot-password',
      forgotPasswordDto,
    );
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Req() req: { headers: Record<string, string> },
    @Body() changePasswordDto: any,
  ) {
    const authorization = req.headers.authorization;
    return this.forwardToAuthService(
      'post',
      '/auth/change-password',
      changePasswordDto,
      { authorization },
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@Req() req: { headers: Record<string, string> }) {
    const authorization = req.headers.authorization;
    return this.forwardToAuthService('get', '/auth/me', null, {
      authorization,
    });
  }

  @Post('validate-token')
  @HttpCode(HttpStatus.OK)
  async validateTokenHttp(@Body() data: { token: string }) {
    return this.forwardToAuthService('post', '/auth/validate-token', data);
  }

  // Kafka-based validation for internal microservices
  @Get('validate')
  @UseGuards(JwtAuthGuard)
  async validateToken(@Req() req: { headers: Record<string, string> }) {
    const token = req.headers.authorization?.split(' ')[1];

    // Use Kafka if available, otherwise fall back to HTTP
    if (this.authClient) {
      try {
        const result = await firstValueFrom(
          this.authClient.send('auth.validate-token', { token }),
        );
        return result;
      } catch {
        // Fall back to HTTP if Kafka fails
      }
    }

    // HTTP fallback
    return this.forwardToAuthService('post', '/auth/validate-token', { token });
  }
}
