export interface SepayTransaction {
  id: string;
  transactionId?: string;
  accountNumber?: string;
  transactionDate?: Date;
  transferAmount: number;
  content?: string;
  referenceNumber?: string;
  rawBody?: Record<string, any>;
  createdAt: Date;
}

export interface SepayWebhookPayload {
  id?: string | number;
  gateway?: string;
  transactionDate?: string;
  accountNumber?: string;
  subAccount?: string | null;
  code?: string | null;
  content?: string;
  transferType?: string;
  description?: string;
  transferAmount?: number;
  referenceCode?: string;
  accumulated?: number;
  [key: string]: any;
}

export interface CheckTransactionResult {
  found: boolean;
  message: string;
  data: SepayTransaction[];
}