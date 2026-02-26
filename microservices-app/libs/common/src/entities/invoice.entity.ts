export enum InvoiceStatus {
  UNPAID = 'unpaid',
  PAID = 'paid',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export enum PaymentMethod {
  CASH = 'cash',
  BANK_TRANSFER = 'bank_transfer',
  CARD = 'card',
  SEPAY = 'sepay',
  MOMO = 'momo',
  VNPAY = 'vnpay',
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  itemType: 'service' | 'product' | 'discount' | 'other';
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  hairstyleId?: string;
  createdAt: Date;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  appointmentId?: string;
  createdBy: string;
  createdByRole: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  branchId?: string;
  branchName?: string;
  stylistId?: string;
  stylistName?: string;
  status: InvoiceStatus;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  paidAt?: Date;
  paidBy?: string;
  notes?: string;
  cancellationReason?: string;
  cancelledAt?: Date;
  cancelledBy?: string;
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceDetailed extends Invoice {
  items: InvoiceItem[];
  branchAddress?: string;
  branchPhone?: string;
}

export interface InvoiceStats {
  total: number;
  unpaid: number;
  paid: number;
  cancelled: number;
  totalRevenue: number;
  todayRevenue: number;
  monthlyRevenue: number;
}