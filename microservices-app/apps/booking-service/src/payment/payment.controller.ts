import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CheckTransactionDto } from './dto/payment.dto';
import { SepayWebhookPayload } from '@app/common/entities/payment.entity';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * [PUBLIC] Sepay gọi vào đây khi có giao dịch mới
   * POST /api/v1/payment/webhook/sepay
   */
  @Post('webhook/sepay')
  @HttpCode(HttpStatus.OK)
  async handleSepayWebhook(
    @Body() payload: SepayWebhookPayload,
    @Headers('authorization') authHeader: string,
  ) {
    const result = await this.paymentService.handleSepayWebhook(
      payload,
      authHeader,
    );
    return {
      success: result.success,
    };
  }

  /**
   * [PUBLIC] Tra cứu giao dịch theo nội dung
   * GET /api/v1/payment/check?content=MADONHANG123
   */
  @Get('check')
  @HttpCode(HttpStatus.OK)
  async checkTransaction(@Query() dto: CheckTransactionDto) {
    const result = await this.paymentService.checkTransactionByContent(
      dto.content,
    );
    return {
      statusCode: HttpStatus.OK,
      ...result,
      timestamp: new Date().toISOString(),
    };
  }
}