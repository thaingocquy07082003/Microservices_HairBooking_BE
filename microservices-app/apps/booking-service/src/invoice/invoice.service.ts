import {
  Injectable, NotFoundException, BadRequestException, ConflictException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { RedisService } from '@app/redis';
import {
  Invoice, InvoiceDetailed, InvoiceStatus, InvoiceStats, InvoiceItem, PaymentMethod
} from '@app/common/entities/invoice.entity';
import {
  CreateInvoiceDto, UpdateInvoiceDto, PayInvoiceDto,
  CancelInvoiceDto, FilterInvoiceDto, GetInvoiceStatsDto, SendInvoiceEmailDto
} from './dto/invoice.dto';

@Injectable()
export class InvoiceService {
  private supabase: SupabaseClient;

  private readonly CACHE_TTL = { INVOICE: 1800, LIST: 300, STATS: 300 };
  private readonly CACHE_KEYS = {
    invoice: (id: string) => `invoice:${id}`,
    list: (f: string) => `invoices:list:${f}`,
    stats: (f: string) => `invoices:stats:${f}`,
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.supabase = createClient(
      this.configService.getOrThrow('SUPABASE_URL'),
      this.configService.getOrThrow('SUPABASE_SERVICE_KEY'),
    );
  }

  // ==================== CREATE ====================

  async createInvoice(dto: CreateInvoiceDto, userId: string, userRole: string): Promise<InvoiceDetailed> {
    // Tính subtotal từ items
    const subtotal = dto.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const discount = dto.discountAmount ?? 0;
    const tax = dto.taxAmount ?? 0;
    const total = subtotal - discount + tax;

    // Generate invoice number
    const { data: invNumData } = await this.supabase.rpc('generate_invoice_number');
    const invoiceNumber = invNumData as string;

    // Lấy thông tin branch/stylist nếu có
    let branchName: string | null = null;
    let stylistName: string | null = null;

    if (dto.branchId) {
      const { data: branch } = await this.supabase.from('branches').select('name').eq('id', dto.branchId).single();
      branchName = branch?.name ?? null;
    }
    if (dto.stylistId) {
      const { data: stylist } = await this.supabase.from('stylists').select('full_name').eq('id', dto.stylistId).single();
      stylistName = stylist?.full_name ?? null;
    }

    // Tạo invoice
    const { data: invoice, error } = await this.supabase
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber,
        appointment_id: dto.appointmentId ?? null,
        created_by: userId,
        created_by_role: userRole,
        customer_id: dto.customerId ?? null,
        customer_name: dto.customerName,
        customer_phone: dto.customerPhone,
        customer_email: dto.customerEmail ?? null,
        branch_id: dto.branchId ?? null,
        branch_name: branchName,
        stylist_id: dto.stylistId ?? null,
        stylist_name: stylistName,
        status: InvoiceStatus.UNPAID,
        subtotal,
        discount_amount: discount,
        tax_amount: tax,
        total_amount: total,
        notes: dto.notes ?? null,
        due_date: dto.dueDate?.toISOString() ?? null,
      })
      .select()
      .single();

    if (error) throw new BadRequestException(`Lỗi tạo hóa đơn: ${error.message}`);

    // Tạo invoice items
    const itemsData = dto.items.map(item => ({
      invoice_id: invoice.id,
      item_type: item.itemType ?? 'service',
      name: item.name,
      description: item.description ?? null,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total_price: item.unitPrice * item.quantity,
      hairstyle_id: item.hairstyleId ?? null,
    }));

    const { error: itemsError } = await this.supabase.from('invoice_items').insert(itemsData);
    if (itemsError) throw new BadRequestException(`Lỗi tạo invoice items: ${itemsError.message}`);

    await this.invalidateListCache();
    return this.getInvoiceById(invoice.id);
  }

  // ==================== GET BY ID ====================

  async getInvoiceById(id: string): Promise<InvoiceDetailed> {
    const cacheKey = this.CACHE_KEYS.invoice(id);
    const cached = await this.redisService.get<InvoiceDetailed>(cacheKey);
    if (cached) return cached;

    const { data, error } = await this.supabase
      .from('invoices_detailed')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException(`Không tìm thấy hóa đơn: ${id}`);

    const invoice = this.mapInvoiceDetailedFromDb(data);
    await this.redisService.set(cacheKey, invoice, this.CACHE_TTL.INVOICE);
    return invoice;
  }

  // ==================== GET ALL ====================

  async getAllInvoices(filter: FilterInvoiceDto): Promise<{
    data: Invoice[]; total: number; page: number; limit: number; totalPages: number;
  }> {
    const cacheKey = this.CACHE_KEYS.list(JSON.stringify(filter));
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) return cached;

    let query = this.supabase.from('invoices').select('*', { count: 'exact' });

    if (filter.status) query = query.eq('status', filter.status);
    if (filter.customerId) query = query.eq('customer_id', filter.customerId);
    if (filter.branchId) query = query.eq('branch_id', filter.branchId);
    if (filter.stylistId) query = query.eq('stylist_id', filter.stylistId);
    if (filter.dateFrom) query = query.gte('created_at', filter.dateFrom.toISOString());
    if (filter.dateTo) query = query.lte('created_at', filter.dateTo.toISOString());
    if (filter.search) {
      query = query.or(
        `customer_name.ilike.%${filter.search}%,customer_phone.ilike.%${filter.search}%,invoice_number.ilike.%${filter.search}%`
      );
    }

    const sortBy = filter.sortBy ?? 'created_at';
    query = query.order(sortBy, { ascending: filter.order === 'asc' });

    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    query = query.range((page - 1) * limit, page * limit - 1);

    const { data, count, error } = await query;
    if (error) throw new BadRequestException(`Lỗi lấy danh sách hóa đơn: ${error.message}`);

    const result = {
      data: (data ?? []).map(i => this.mapInvoiceFromDb(i)),
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    };

    await this.redisService.set(cacheKey, result, this.CACHE_TTL.LIST);
    return result;
  }

  // ==================== UPDATE ====================

  async updateInvoice(id: string, dto: UpdateInvoiceDto): Promise<InvoiceDetailed> {
    const existing = await this.getInvoiceById(id);
    if (existing.status !== InvoiceStatus.UNPAID) {
      throw new BadRequestException('Chỉ có thể cập nhật hóa đơn chưa thanh toán');
    }

    const updateData: any = {};
    if (dto.customerName) updateData.customer_name = dto.customerName;
    if (dto.customerPhone) updateData.customer_phone = dto.customerPhone;
    if (dto.customerEmail !== undefined) updateData.customer_email = dto.customerEmail;
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    // Tính lại tổng nếu cập nhật items
    if (dto.items) {
      const subtotal = dto.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
      const discount = dto.discountAmount ?? existing.discountAmount;
      const tax = dto.taxAmount ?? existing.taxAmount;
      updateData.subtotal = subtotal;
      updateData.discount_amount = discount;
      updateData.tax_amount = tax;
      updateData.total_amount = subtotal - discount + tax;

      // Xóa items cũ và thêm mới
      await this.supabase.from('invoice_items').delete().eq('invoice_id', id);
      const itemsData = dto.items.map(item => ({
        invoice_id: id,
        item_type: item.itemType ?? 'service',
        name: item.name,
        description: item.description ?? null,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.unitPrice * item.quantity,
        hairstyle_id: item.hairstyleId ?? null,
      }));
      await this.supabase.from('invoice_items').insert(itemsData);
    } else {
      if (dto.discountAmount !== undefined) {
        updateData.discount_amount = dto.discountAmount;
        updateData.total_amount = existing.subtotal - dto.discountAmount + existing.taxAmount;
      }
      if (dto.taxAmount !== undefined) {
        updateData.tax_amount = dto.taxAmount;
        updateData.total_amount = existing.subtotal - existing.discountAmount + dto.taxAmount;
      }
    }

    const { error } = await this.supabase.from('invoices').update(updateData).eq('id', id);
    if (error) throw new BadRequestException(`Lỗi cập nhật hóa đơn: ${error.message}`);

    await this.invalidateInvoiceCache(id);
    await this.invalidateListCache();
    return this.getInvoiceById(id);
  }

  // ==================== PAY ====================

  async payInvoice(id: string, dto: PayInvoiceDto, paidByUserId: string): Promise<InvoiceDetailed> {
    const existing = await this.getInvoiceById(id);
    if (existing.status !== InvoiceStatus.UNPAID) {
      throw new BadRequestException('Hóa đơn này đã được thanh toán hoặc đã hủy');
    }

    const { error } = await this.supabase
      .from('invoices')
      .update({
        status: InvoiceStatus.PAID,
        payment_method: dto.paymentMethod,
        payment_reference: dto.paymentReference ?? null,
        paid_at: new Date().toISOString(),
        paid_by: paidByUserId,
        notes: dto.notes ?? existing.notes,
      })
      .eq('id', id);

    if (error) throw new BadRequestException(`Lỗi thanh toán hóa đơn: ${error.message}`);

    await this.invalidateInvoiceCache(id);
    await this.invalidateListCache();
    return this.getInvoiceById(id);
  }

  // ==================== CANCEL ====================

  async cancelInvoice(id: string, dto: CancelInvoiceDto, cancelledByUserId: string): Promise<InvoiceDetailed> {
    const existing = await this.getInvoiceById(id);
    if (existing.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Không thể hủy hóa đơn đã thanh toán. Vui lòng dùng tính năng hoàn tiền.');
    }
    if (existing.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Hóa đơn này đã bị hủy');
    }

    const { error } = await this.supabase
      .from('invoices')
      .update({
        status: InvoiceStatus.CANCELLED,
        cancellation_reason: dto.cancellationReason,
        cancelled_at: new Date().toISOString(),
        cancelled_by: cancelledByUserId,
      })
      .eq('id', id);

    if (error) throw new BadRequestException(`Lỗi hủy hóa đơn: ${error.message}`);

    await this.invalidateInvoiceCache(id);
    await this.invalidateListCache();
    return this.getInvoiceById(id);
  }

  // ==================== STATS ====================

  async getInvoiceStats(filter: GetInvoiceStatsDto): Promise<InvoiceStats> {
    const cacheKey = this.CACHE_KEYS.stats(JSON.stringify(filter));
    const cached = await this.redisService.get<InvoiceStats>(cacheKey);
    if (cached) return cached;

    let query = this.supabase.from('invoices').select('status, total_amount, paid_at, created_at');

    if (filter.branchId) query = query.eq('branch_id', filter.branchId);
    if (filter.dateFrom) query = query.gte('created_at', filter.dateFrom.toISOString());
    if (filter.dateTo) query = query.lte('created_at', filter.dateTo.toISOString());

    const { data, error } = await query;
    if (error) throw new BadRequestException(`Lỗi lấy thống kê: ${error.message}`);

    const today = new Date().toISOString().split('T')[0];
    const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

    const stats: InvoiceStats = {
      total: data?.length ?? 0,
      unpaid: data?.filter(i => i.status === 'unpaid').length ?? 0,
      paid: data?.filter(i => i.status === 'paid').length ?? 0,
      cancelled: data?.filter(i => i.status === 'cancelled').length ?? 0,
      totalRevenue: data?.filter(i => i.status === 'paid').reduce((s, i) => s + parseFloat(i.total_amount), 0) ?? 0,
      todayRevenue: data?.filter(i => i.status === 'paid' && i.paid_at?.startsWith(today)).reduce((s, i) => s + parseFloat(i.total_amount), 0) ?? 0,
      monthlyRevenue: data?.filter(i => i.status === 'paid' && i.paid_at?.startsWith(thisMonth)).reduce((s, i) => s + parseFloat(i.total_amount), 0) ?? 0,
    };

    await this.redisService.set(cacheKey, stats, this.CACHE_TTL.STATS);
    return stats;
  }

  // ==================== GET INVOICE DATA FOR EMAIL ====================
  // Trả về InvoiceDetailed - email template dùng data này

  async getInvoiceForEmail(id: string): Promise<InvoiceDetailed> {
    return this.getInvoiceById(id);
  }

  // ==================== HELPERS ====================

  private mapInvoiceFromDb(d: any): Invoice {
    return {
      id: d.id,
      invoiceNumber: d.invoice_number,
      appointmentId: d.appointment_id,
      createdBy: d.created_by,
      createdByRole: d.created_by_role,
      customerId: d.customer_id,
      customerName: d.customer_name,
      customerPhone: d.customer_phone,
      customerEmail: d.customer_email,
      branchId: d.branch_id,
      branchName: d.branch_name,
      stylistId: d.stylist_id,
      stylistName: d.stylist_name,
      status: d.status as InvoiceStatus,
      subtotal: parseFloat(d.subtotal),
      discountAmount: parseFloat(d.discount_amount),
      taxAmount: parseFloat(d.tax_amount),
      totalAmount: parseFloat(d.total_amount),
      paymentMethod: d.payment_method as PaymentMethod,
      paymentReference: d.payment_reference,
      paidAt: d.paid_at ? new Date(d.paid_at) : undefined,
      paidBy: d.paid_by,
      notes: d.notes,
      cancellationReason: d.cancellation_reason,
      cancelledAt: d.cancelled_at ? new Date(d.cancelled_at) : undefined,
      cancelledBy: d.cancelled_by,
      dueDate: d.due_date ? new Date(d.due_date) : undefined,
      createdAt: new Date(d.created_at),
      updatedAt: new Date(d.updated_at),
    };
  }

  private mapInvoiceDetailedFromDb(d: any): InvoiceDetailed {
    const items: InvoiceItem[] = (d.items ?? []).map((i: any) => ({
      id: i.id,
      invoiceId: d.id,
      itemType: i.itemType,
      name: i.name,
      description: i.description,
      quantity: i.quantity,
      unitPrice: parseFloat(i.unitPrice),
      totalPrice: parseFloat(i.totalPrice),
      hairstyleId: i.hairstyleId,
      createdAt: new Date(i.created_at ?? d.created_at),
    }));

    return {
      ...this.mapInvoiceFromDb(d),
      items,
      branchAddress: d.branch_address,
      branchPhone: d.branch_phone,
    };
  }

  private async invalidateInvoiceCache(id: string) {
    await this.redisService.delete(this.CACHE_KEYS.invoice(id));
  }

  private async invalidateListCache() {
    const client = this.redisService.getClient();
    const keys = await client.keys('invoices:*');
    if (keys.length > 0) await client.del(...keys);
  }
}