import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  SepayTransaction,
  SepayWebhookPayload,
  CheckTransactionResult,
} from '@app/common/entities/payment.entity';

@Injectable()
export class PaymentService {
  private supabase: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    this.supabase = createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_SERVICE_KEY'),
    );
  }

  // ==================== XỬ LÝ WEBHOOK TỪ SEPAY ====================

  async handleSepayWebhook(
    payload: SepayWebhookPayload,
    authHeader?: string,
  ): Promise<{ success: boolean }> {
    console.log('[Sepay Webhook] Payload received:', JSON.stringify(payload));
    // Parse transaction date
    let transactionDate: string | null = null;
    if (payload.transactionDate) {
      try {
        transactionDate = new Date(payload.transactionDate).toISOString();
      } catch {
        transactionDate = null;
      }
    }

    const transactionId = payload.id ? String(payload.id) : null;

    // Nếu có transactionId, check duplicate
    if (transactionId) {
      const { data: existing } = await this.supabase
        .from('sepay_transactions')
        .select('id')
        .eq('transaction_id', transactionId)
        .maybeSingle();

      if (existing) {
        console.log(`[Sepay Webhook] Duplicate transaction skipped: ${transactionId}`);
        return { success: true };
      }
    }

    // Lưu vào Supabase
    const { error } = await this.supabase.from('sepay_transactions').insert({
      transaction_id: transactionId,
      account_number: payload.accountNumber ?? null,
      transaction_date: transactionDate,
      transfer_amount: payload.transferAmount ?? 0,
      content: payload.content ?? null,
      reference_number: payload.referenceCode ?? null,
      raw_body: payload,
    });

    if (error) {
      console.error('[Sepay Webhook] DB error:', error.message);
      throw new BadRequestException(`Lỗi lưu giao dịch: ${error.message}`);
    }

    console.log(`[Sepay Webhook] Saved transaction: ${transactionId}`);
    return { success: true };
  }

  // ==================== TRA CỨU GIAO DỊCH THEO CONTENT ====================

  async checkTransactionByContent(content: string): Promise<CheckTransactionResult> {
    if (!content?.trim()) {
      throw new BadRequestException('Nội dung tra cứu không được để trống');
    }

    const { data, error } = await this.supabase
      .from('sepay_transactions')
      .select(
        'id, transaction_id, account_number, transaction_date, transfer_amount, content, reference_number, created_at',
      )
      .ilike('content', `%${content.trim()}%`) // tìm kiếm không phân biệt hoa thường
      .order('transaction_date', { ascending: false })
      .limit(20);

    if (error) {
      throw new BadRequestException(`Lỗi tra cứu: ${error.message}`);
    }

    const transactions = (data || []).map((row) =>
      this.mapTransactionFromDb(row),
    );

    return {
      found: transactions.length > 0,
      message:
        transactions.length > 0
          ? `Tìm thấy ${transactions.length} giao dịch với nội dung "${content}"`
          : `Không tìm thấy giao dịch nào với nội dung "${content}"`,
      data: transactions,
    };
  }

  // ==================== HELPER ====================

  private mapTransactionFromDb(row: any): SepayTransaction {
    return {
      id: row.id,
      transactionId: row.transaction_id,
      accountNumber: row.account_number,
      transactionDate: row.transaction_date
        ? new Date(row.transaction_date)
        : undefined,
      transferAmount: parseFloat(row.transfer_amount ?? 0),
      content: row.content,
      referenceNumber: row.reference_number,
      createdAt: new Date(row.created_at),
    };
  }
}