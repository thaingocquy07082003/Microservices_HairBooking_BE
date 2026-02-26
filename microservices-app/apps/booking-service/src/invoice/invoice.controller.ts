import {
  Controller, Get, Post, Put, Body, Param,
  Query, HttpCode, HttpStatus, UseGuards
} from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { KafkaService, KafkaTopics, InvoiceSendEmailEvent } from '@app/kafka';
import {
  CreateInvoiceDto, UpdateInvoiceDto, PayInvoiceDto,
  CancelInvoiceDto, FilterInvoiceDto, GetInvoiceStatsDto, SendInvoiceEmailDto
} from './dto/invoice.dto';
import { JwtAuthGuard, Role, User } from '@app/common';
import { RolesGuard } from '@app/common/strategies/roles.guard';
import { Roles } from '@app/common/decorators/roles.decorator';

@Controller('invoices')
export class InvoiceController {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly kafkaService: KafkaService,
  ) {}

  // ==================== TẠO HÓA ĐƠN ====================
  // Customer hoặc Staff/Manager đều có thể tạo

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createInvoice(@Body() dto: CreateInvoiceDto, @User() user: any) {
    // Customer chỉ tạo hóa đơn cho mình
    if (user.role === Role.Customer) {
      dto.customerId = user.id;
    }
    const invoice = await this.invoiceService.createInvoice(dto, user.id, user.role);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Tạo hóa đơn thành công',
      data: invoice,
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== XEM DANH SÁCH - CUSTOMER ====================

  @Get('my-invoices')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getMyInvoices(@Query() filter: FilterInvoiceDto, @User() user: any) {
    filter.customerId = user.id;
    const result = await this.invoiceService.getAllInvoices(filter);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách hóa đơn thành công',
      data: result.data,
      meta: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages },
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== XEM DANH SÁCH - STAFF/MANAGER ====================

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Receptionist, Role.HairStylist, Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async getAllInvoices(@Query() filter: FilterInvoiceDto, @User() user: any) {
    // HairStylist chỉ xem hóa đơn trong branch mình
    // Manager lọc thêm theo branch nếu cần
    const result = await this.invoiceService.getAllInvoices(filter);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách hóa đơn thành công',
      data: result.data,
      meta: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages },
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== XEM CHI TIẾT ====================

  @Get('stats/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async getInvoiceStats(@Query() filter: GetInvoiceStatsDto) {
    const stats = await this.invoiceService.getInvoiceStats(filter);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thống kê hóa đơn thành công',
      data: stats,
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getInvoiceById(@Param('id') id: string, @User() user: any) {
    const invoice = await this.invoiceService.getInvoiceById(id);

    // Customer chỉ xem hóa đơn của mình
    if (user.role === Role.Customer && invoice.customerId !== user.id) {
      return {
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Bạn không có quyền xem hóa đơn này',
        timestamp: new Date().toISOString(),
      };
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin hóa đơn thành công',
      data: invoice,
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== CẬP NHẬT ====================

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Receptionist, Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async updateInvoice(@Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    const invoice = await this.invoiceService.updateInvoice(id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật hóa đơn thành công',
      data: invoice,
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== THANH TOÁN ====================

  @Post(':id/pay')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Receptionist, Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async payInvoice(
    @Param('id') id: string,
    @Body() dto: PayInvoiceDto,
    @User() user: any,
  ) {
    const invoice = await this.invoiceService.payInvoice(id, dto, user.id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Thanh toán hóa đơn thành công',
      data: invoice,
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== GỬI EMAIL HÓA ĐƠN ====================

  @Post(':id/send-email')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Receptionist, Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async sendInvoiceEmail(
    @Param('id') id: string,
    @Body() dto: SendInvoiceEmailDto,
  ) {
    const invoice = await this.invoiceService.getInvoiceForEmail(id);
    const targetEmail = dto.overrideEmail ?? invoice.customerEmail;

    if (!targetEmail) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Khách hàng không có email. Vui lòng cung cấp email để gửi.',
        timestamp: new Date().toISOString(),
      };
    }

    // Emit event qua Kafka để auth-service gửi email
    this.kafkaService.emit<InvoiceSendEmailEvent>(KafkaTopics.INVOICE_EMAIL_SEND, {
      email: targetEmail,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName,
      status: invoice.status,
      items: invoice.items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      })),
      subtotal: invoice.subtotal,
      discountAmount: invoice.discountAmount,
      taxAmount: invoice.taxAmount,
      totalAmount: invoice.totalAmount,
      paymentMethod: invoice.paymentMethod,
      paidAt: invoice.paidAt,
      branchName: invoice.branchName,
      stylistName: invoice.stylistName,
      createdAt: invoice.createdAt,
      timestamp: new Date(),
    });

    return {
      statusCode: HttpStatus.OK,
      message: `Đã gửi yêu cầu gửi hóa đơn đến ${targetEmail}`,
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== HỦY ====================

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Receptionist, Role.Manager, Role.Admin, Role.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  async cancelInvoice(
    @Param('id') id: string,
    @Body() dto: CancelInvoiceDto,
    @User() user: any,
  ) {
    const invoice = await this.invoiceService.cancelInvoice(id, dto, user.id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Hủy hóa đơn thành công',
      data: invoice,
      timestamp: new Date().toISOString(),
    };
  }
}