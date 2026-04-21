// booking-service/src/appointments/appointment.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { RedisService } from '@app/redis';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import {
  Appointment,
  AppointmentDetailed,
  AppointmentStatus,
  AppointmentStats,
  AppointmentServiceSummary,
} from '@app/common/entities/booking.entity';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  FilterAppointmentDto,
  CancelAppointmentDto,
  ConfirmAppointmentDto,
  RescheduleAppointmentDto,
  CompleteAppointmentDto,
  CheckAvailabilityDto,
  GetAvailableSlotsDto,
  GetAppointmentStatsDto,
} from './dto/appointment.dto';

@Injectable()
export class AppointmentsService {
  private supabase: SupabaseClient;

  private readonly CACHE_TTL = {
    APPOINTMENT: 1800,  // 30 minutes
    LIST: 600,          // 10 minutes
    AVAILABILITY: 300,  // 5 minutes
  };

  private readonly CACHE_KEYS = {
    appointment: (id: string) => `appointment:${id}`,
    appointmentsList: (filter: string) => `appointments:list:${filter}`,
    availability: (stylistId: string, date: string) => `availability:${stylistId}:${date}`,
    stats: (filter: string) => `appointments:stats:${filter}`,
  };

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.supabase = createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_SERVICE_KEY'),
    );
  }

  // ==================== CREATE APPOINTMENT ====================

  async createAppointment(dto: CreateAppointmentDto): Promise<Appointment> {
    const endTime = this.calculateEndTime(dto.startTime!, dto.duration!);

    // ✅ Validate serviceIds nếu có
    if (dto.serviceIds && dto.serviceIds.length > 0) {
      await this.validateServiceIds(dto.serviceIds);
    }

    // Check stylist availability
    const isAvailable = await this.checkStylistAvailability({
      stylistId: dto.stylistId,
      date: dto.appointmentDate,
      duration: dto.duration,
      startTime: dto.startTime,
      endTime: endTime,
    });

    if (!isAvailable) {
      throw new ConflictException(
        'Thợ cắt tóc không khả dụng tại thời điểm này. Vui lòng chọn thời gian khác' +
          ' DATE:' + dto.appointmentDate!.toISOString().split('T')[0] +
          ' TIME:' + dto.startTime,
      );
    }

    // Verify hairstyle exists
    const { data: hairstyle, error: hairstyleError } = await this.supabase
      .from('hairstyles')
      .select('id, price, duration')
      .eq('id', dto.hairstyleId)
      .eq('is_active', true)
      .single();

    if (hairstyleError || !hairstyle) {
      throw new NotFoundException(`Không tìm thấy kiểu tóc với ID: ${dto.hairstyleId}`);
    }

    // Verify stylist exists
    const { data: stylist, error: stylistError } = await this.supabase
      .from('stylists')
      .select('id')
      .eq('id', dto.stylistId)
      .eq('is_available', true)
      .single();

    if (stylistError || !stylist) {
      throw new NotFoundException(`Không tìm thấy thợ cắt tóc với ID: ${dto.stylistId}`);
    }

    // Create appointment
    const { data: appointment, error } = await this.supabase
      .from('appointments')
      .insert({
        customer_id: dto.customerId,
        stylist_id: dto.stylistId,
        hairstyle_id: dto.hairstyleId,
        appointment_date: dto.appointmentDate!.toISOString().split('T')[0],
        start_time: dto.startTime,
        end_time: endTime,
        duration: dto.duration,
        customer_name: dto.customerName,
        customer_phone: dto.customerPhone,
        customer_email: dto.customerEmail,
        notes: dto.notes,
        price: dto.price || hairstyle.price,
        deposit_amount: dto.depositAmount || 0,
        deposit_paid: dto.depositPaid || false,
        status: AppointmentStatus.PENDING,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi tạo lịch hẹn: ${error.message}`);
    }

    // ✅ Tạo liên kết appointment_services nếu có serviceIds
    if (dto.serviceIds && dto.serviceIds.length > 0) {
      await this.syncAppointmentServices(appointment.id, dto.serviceIds);
    }

    // Invalidate cache
    await this.invalidateAppointmentsCache();
    await this.invalidateAvailabilityCache(dto.stylistId!, dto.appointmentDate!);

    // Return với serviceIds
    return this.getAppointmentById(appointment.id) as Promise<Appointment>;
  }

  // ==================== GET APPOINTMENT BY ID ====================

  async getAppointmentById(
    id: string,
    includeDetails: boolean = false,
  ): Promise<Appointment | AppointmentDetailed> {
    const cacheKey = this.CACHE_KEYS.appointment(id);
    const cached = await this.redisService.get<Appointment>(cacheKey);
    if (cached && !includeDetails) {
      return cached;
    }

    // ✅ Luôn dùng view appointments_detailed để có services
    const { data, error } = await this.supabase
      .from('appointments_detailed')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Không tìm thấy lịch hẹn với ID: ${id}`);
    }

    // ✅ Lấy serviceIds riêng từ bảng appointment_services
    const serviceIds = await this.getServiceIdsByAppointmentId(id);

    const appointment = includeDetails
      ? this.mapAppointmentDetailedFromDb(data, serviceIds)
      : this.mapAppointmentFromDb(data, serviceIds);

    if (!includeDetails) {
      await this.redisService.set(cacheKey, appointment, this.CACHE_TTL.APPOINTMENT);
    }

    return appointment;
  }

  // ==================== GET ALL APPOINTMENTS ====================

  async getAllAppointments(filter: FilterAppointmentDto): Promise<{
    data: Appointment[] | AppointmentDetailed[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const filterKey = JSON.stringify(filter);
    const cacheKey = this.CACHE_KEYS.appointmentsList(filterKey);

    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) return cached;

    // ✅ Luôn dùng appointments_detailed để có services
    let query = this.supabase
      .from('appointments_detailed')
      .select('*', { count: 'exact' });

    // Apply filters
    if (filter.status)     query = query.eq('status', filter.status);
    if (filter.customerId) query = query.eq('customer_id', filter.customerId);
    if (filter.stylistId)  query = query.eq('stylist_id', filter.stylistId);
    if (filter.hairstyleId) query = query.eq('hairstyle_id', filter.hairstyleId);
    if (filter.dateFrom)   query = query.gte('appointment_date', filter.dateFrom.toISOString().split('T')[0]);
    if (filter.dateTo)     query = query.lte('appointment_date', filter.dateTo.toISOString().split('T')[0]);
    if (filter.search) {
      query = query.or(
        `customer_name.ilike.%${filter.search}%,customer_phone.ilike.%${filter.search}%`,
      );
    }

    // ✅ NEW: Filter theo serviceId - lấy appointment_ids có chứa serviceId này
    if (filter.serviceId) {
      const { data: aptServiceLinks } = await this.supabase
        .from('appointment_services')
        .select('appointment_id')
        .eq('service_id', filter.serviceId);

      const aptIds = (aptServiceLinks ?? []).map((r: any) => r.appointment_id);

      if (aptIds.length === 0) {
        // Không có appointment nào có service này → trả về rỗng
        return { data: [], total: 0, page: filter.page ?? 1, limit: filter.limit ?? 20, totalPages: 0 };
      }
      query = query.in('id', aptIds);
    }

    // Sorting
    const sortBy = filter.sortBy || 'appointment_date';
    const order = filter.order || 'asc';
    const dbSortBy =
      sortBy === 'appointmentDate' ? 'appointment_date' :
      sortBy === 'startTime'       ? 'start_time' :
      sortBy === 'createdAt'       ? 'created_at' : sortBy;

    query = query.order(dbSortBy, { ascending: order === 'asc' });
    if (dbSortBy === 'appointment_date') {
      query = query.order('start_time', { ascending: order === 'asc' });
    }

    // Pagination
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      throw new BadRequestException(`Lỗi khi lấy danh sách lịch hẹn: ${error.message}`);
    }

    // ✅ Lấy serviceIds cho từng appointment
    const aptIds = (data || []).map((a: any) => a.id);
    const serviceIdMap = await this.getServiceIdMapByAppointmentIds(aptIds);

    const appointments = (data || []).map((a: any) => {
      const sIds = serviceIdMap[a.id] ?? null;
      return filter.includeDetails
        ? this.mapAppointmentDetailedFromDb(a, sIds)
        : this.mapAppointmentFromDb(a, sIds);
    });

    const result = {
      data: appointments,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };

    await this.redisService.set(cacheKey, result, this.CACHE_TTL.LIST);
    return result;
  }

  // ==================== UPDATE APPOINTMENT ====================

  async updateAppointment(id: string, dto: UpdateAppointmentDto): Promise<Appointment> {
    const existing = await this.getAppointmentById(id) as Appointment;
    const existingDate = this.normalizeDate(existing.appointmentDate, 'appointmentDate');
    const existingDateKey = this.toDateKey(existingDate);
    const existingStartTime = this.toHHmm(existing.startTime);

    // ✅ Validate serviceIds mới nếu có
    if (dto.serviceIds && dto.serviceIds.length > 0) {
      await this.validateServiceIds(dto.serviceIds);
    }

    // Chỉ check availability nếu lịch thực sự thay đổi; bỏ qua khi hủy/no_show.
    const checkDate = this.normalizeDate(dto.appointmentDate ?? existingDate, 'appointmentDate');
    const checkDateKey = this.toDateKey(checkDate);
    const checkStylist = dto.stylistId ?? existing.stylistId;
    const checkDuration = dto.duration ?? existing.duration;
    const checkStartTime = this.toHHmm(dto.startTime ?? existing.startTime);
    const hasScheduleChange =
      checkStylist !== existing.stylistId ||
      checkDateKey !== existingDateKey ||
      checkStartTime !== existingStartTime ||
      checkDuration !== existing.duration;
    const skipAvailabilityCheck =
      dto.status === AppointmentStatus.CANCELLED ||
      dto.status === AppointmentStatus.NO_SHOW;

    if (hasScheduleChange && !skipAvailabilityCheck) {
      const isAvailable = await this.checkStylistAvailability({
        stylistId: checkStylist,
        date: checkDate,
        duration: checkDuration,
        excludeAppointmentId: id,
        startTime: checkStartTime,
        endTime: this.calculateEndTime(checkStartTime, checkDuration),
      });

      if (!isAvailable) {
        throw new ConflictException('Thợ cắt tóc không khả dụng tại thời điểm mới');
      }
    }

    // Build update data (chỉ các field của bảng appointments)
    const updateData: any = {};
    if (dto.stylistId)                  updateData.stylist_id = dto.stylistId;
    if (dto.hairstyleId)                updateData.hairstyle_id = dto.hairstyleId;
    if (dto.appointmentDate)            updateData.appointment_date = this.normalizeDate(dto.appointmentDate, 'appointmentDate').toISOString().split('T')[0];
    if (dto.startTime) {
      updateData.start_time = dto.startTime;
      updateData.end_time = this.calculateEndTime(dto.startTime, dto.duration || existing.duration);
    }
    if (dto.duration !== undefined) {
      updateData.duration = dto.duration;
      updateData.end_time = this.calculateEndTime(dto.startTime || existing.startTime, dto.duration);
    }
    if (dto.customerName)               updateData.customer_name = dto.customerName;
    if (dto.customerPhone)              updateData.customer_phone = dto.customerPhone;
    if (dto.customerEmail !== undefined) updateData.customer_email = dto.customerEmail;
    if (dto.notes !== undefined)        updateData.notes = dto.notes;
    if (dto.status) {
      updateData.status = dto.status;
      if (dto.status === AppointmentStatus.CONFIRMED) updateData.confirmed_at = new Date().toISOString();
      if (dto.status === AppointmentStatus.CANCELLED) updateData.cancelled_at = new Date().toISOString();
      if (dto.status === AppointmentStatus.COMPLETED) updateData.completed_at = new Date().toISOString();
    }
    if (dto.price !== undefined)           updateData.price = dto.price;
    if (dto.depositAmount !== undefined)   updateData.deposit_amount = dto.depositAmount;
    if (dto.depositPaid !== undefined)     updateData.deposit_paid = dto.depositPaid;

    // Nếu có field cần update ở bảng appointments thì update
    if (Object.keys(updateData).length > 0) {
      const { error } = await this.supabase
        .from('appointments')
        .update(updateData)
        .eq('id', id);

      if (error) {
        throw new BadRequestException(`Lỗi khi cập nhật lịch hẹn: ${error.message}`);
      }
    } else if (dto.serviceIds === undefined) {
      // Không có gì để update
      throw new BadRequestException('Không có dữ liệu để cập nhật');
    }

    // ✅ Đồng bộ services nếu serviceIds được truyền vào (kể cả mảng rỗng)
    if (dto.serviceIds !== undefined) {
      await this.syncAppointmentServices(id, dto.serviceIds ?? []);
    }

    // Invalidate cache
    await this.invalidateAppointmentCache(id);
    await this.invalidateAppointmentsCache();
    await this.invalidateAvailabilityCache(existing.stylistId, existingDate);
    if (dto.stylistId && dto.stylistId !== existing.stylistId) {
      await this.invalidateAvailabilityCache(dto.stylistId, this.normalizeDate(dto.appointmentDate ?? existingDate, 'appointmentDate'));
    }

    return this.getAppointmentById(id) as Promise<Appointment>;
  }

  // ==================== CANCEL APPOINTMENT ====================

  async cancelAppointment(id: string, dto: CancelAppointmentDto): Promise<Appointment> {
    const existing = await this.getAppointmentById(id) as Appointment;

    if ([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED].includes(existing.status)) {
      throw new BadRequestException(
        `Không thể hủy lịch hẹn đã ${existing.status === AppointmentStatus.COMPLETED ? 'hoàn thành' : 'hủy'}`,
      );
    }

    const { data: appointment, error } = await this.supabase
      .from('appointments')
      .update({
        status: AppointmentStatus.CANCELLED,
        cancellation_reason: dto.cancellationReason,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi hủy lịch hẹn: ${error.message}`);
    }

    await this.invalidateAppointmentCache(id);
    await this.invalidateAppointmentsCache();
    await this.invalidateAvailabilityCache(existing.stylistId, existing.appointmentDate);

    // ✅ Return với serviceIds
    const serviceIds = await this.getServiceIdsByAppointmentId(id);
    return this.mapAppointmentFromDb(appointment, serviceIds);
  }

  // ==================== CONFIRM APPOINTMENT ====================

  async confirmAppointment(id: string, dto: ConfirmAppointmentDto): Promise<Appointment> {
    const existing = await this.getAppointmentById(id) as Appointment;

    if (existing.status !== AppointmentStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể xác nhận lịch hẹn đang ở trạng thái pending');
    }

    const { data: appointment, error } = await this.supabase
      .from('appointments')
      .update({
        status: AppointmentStatus.CONFIRMED,
        confirmed_at: new Date().toISOString(),
        notes: dto.notes || existing.notes,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi xác nhận lịch hẹn: ${error.message}`);
    }

    await this.invalidateAppointmentCache(id);
    await this.invalidateAppointmentsCache();

    const serviceIds = await this.getServiceIdsByAppointmentId(id);
    return this.mapAppointmentFromDb(appointment, serviceIds);
  }

  // ==================== COMPLETE APPOINTMENT ====================

  async completeAppointment(id: string, dto: CompleteAppointmentDto): Promise<Appointment> {
    const existing = await this.getAppointmentById(id) as Appointment;

    if (![AppointmentStatus.CONFIRMED, AppointmentStatus.IN_PROGRESS].includes(existing.status)) {
      throw new BadRequestException('Chỉ có thể hoàn thành lịch hẹn đã xác nhận hoặc đang thực hiện');
    }

    const updateData: any = {
      status: AppointmentStatus.COMPLETED,
      completed_at: new Date().toISOString(),
    };
    if (dto.actualPrice !== undefined) updateData.price = dto.actualPrice;
    if (dto.notes)                     updateData.notes = dto.notes;

    const { data: appointment, error } = await this.supabase
      .from('appointments')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi hoàn thành lịch hẹn: ${error.message}`);
    }

    await this.invalidateAppointmentCache(id);
    await this.invalidateAppointmentsCache();

    const serviceIds = await this.getServiceIdsByAppointmentId(id);
    return this.mapAppointmentFromDb(appointment, serviceIds);
  }

  // ==================== CHECK AVAILABILITY ====================

  async checkStylistAvailability(dto: CheckAvailabilityDto): Promise<boolean> {
    const checkDate = this.normalizeDate(dto.date, 'date');

    const { data, error } = await this.supabase.rpc('is_stylist_available', {
      p_stylist_id: dto.stylistId,
      p_date: checkDate.toISOString().split('T')[0],
      p_start_time: dto.startTime,
      p_end_time: this.calculateEndTime(dto.startTime!, dto.duration!),
      p_exclude_appointment_id: dto.excludeAppointmentId || null,
    });

    if (error) {
      console.error('Error checking availability:', error);
      return false;
    }

    return data === true;
  }

  // ==================== GET APPOINTMENT STATS ====================

  async getAppointmentStats(filter: GetAppointmentStatsDto): Promise<AppointmentStats> {
    const cacheKey = this.CACHE_KEYS.stats(JSON.stringify(filter));
    const cached = await this.redisService.get<AppointmentStats>(cacheKey);
    if (cached) return cached;

    let query = this.supabase
      .from('appointments')
      .select('status, appointment_date', { count: 'exact' });

    if (filter.dateFrom)   query = query.gte('appointment_date', filter.dateFrom.toISOString().split('T')[0]);
    if (filter.dateTo)     query = query.lte('appointment_date', filter.dateTo.toISOString().split('T')[0]);
    if (filter.stylistId)  query = query.eq('stylist_id', filter.stylistId);
    if (filter.customerId) query = query.eq('customer_id', filter.customerId);

    const { data, count, error } = await query;

    if (error) {
      throw new BadRequestException(`Lỗi khi lấy thống kê: ${error.message}`);
    }

    const today = new Date().toISOString().split('T')[0];

    const stats: AppointmentStats = {
      total: count || 0,
      pending:   data?.filter(a => a.status === AppointmentStatus.PENDING).length || 0,
      confirmed: data?.filter(a => a.status === AppointmentStatus.CONFIRMED).length || 0,
      completed: data?.filter(a => a.status === AppointmentStatus.COMPLETED).length || 0,
      cancelled: data?.filter(a => a.status === AppointmentStatus.CANCELLED).length || 0,
      noShow:    data?.filter(a => a.status === AppointmentStatus.NO_SHOW).length || 0,
      todayAppointments:    data?.filter(a => a.appointment_date === today).length || 0,
      upcomingAppointments: data?.filter(a => a.appointment_date > today).length || 0,
    };

    await this.redisService.set(cacheKey, stats, this.CACHE_TTL.LIST);
    return stats;
  }

  // ==================== HELPER: SERVICE IDS ====================

  /**
   * ✅ Validate các serviceIds tồn tại và đang available
   */
  private async validateServiceIds(serviceIds: string[]): Promise<void> {
    if (!serviceIds || serviceIds.length === 0) return;

    const { data: services, error } = await this.supabase
      .from('services')
      .select('id, name, is_available')
      .in('id', serviceIds);

    if (error) {
      throw new BadRequestException(`Lỗi khi kiểm tra dịch vụ: ${error.message}`);
    }

    // Kiểm tra tất cả IDs tồn tại
    const foundIds = new Set((services ?? []).map((s: any) => s.id));
    const missingIds = serviceIds.filter(id => !foundIds.has(id));
    if (missingIds.length > 0) {
      throw new NotFoundException(`Không tìm thấy các dịch vụ với ID: ${missingIds.join(', ')}`);
    }

    // Kiểm tra tất cả đang available
    const unavailable = (services ?? []).filter((s: any) => !s.is_available);
    if (unavailable.length > 0) {
      throw new BadRequestException(
        `Các dịch vụ sau đã bị vô hiệu hóa: ${unavailable.map((s: any) => s.name).join(', ')}`,
      );
    }
  }

  /**
   * ✅ Đồng bộ bảng appointment_services:
   * - Xóa toàn bộ links cũ
   * - Thêm links mới theo serviceIds
   */
  private async syncAppointmentServices(
    appointmentId: string,
    serviceIds: string[],
  ): Promise<void> {
    // Xóa toàn bộ links cũ
    await this.supabase
      .from('appointment_services')
      .delete()
      .eq('appointment_id', appointmentId);

    if (!serviceIds || serviceIds.length === 0) return;

    // Loại bỏ duplicate
    const uniqueIds = [...new Set(serviceIds)];

    const rows = uniqueIds.map(serviceId => ({
      appointment_id: appointmentId,
      service_id: serviceId,
    }));

    const { error } = await this.supabase
      .from('appointment_services')
      .insert(rows);

    if (error) {
      throw new BadRequestException(`Lỗi khi lưu dịch vụ của lịch hẹn: ${error.message}`);
    }
  }

  /**
   * ✅ Lấy danh sách serviceIds của một appointment
   */
  private async getServiceIdsByAppointmentId(appointmentId: string): Promise<string[] | null> {
    const { data, error } = await this.supabase
      .from('appointment_services')
      .select('service_id')
      .eq('appointment_id', appointmentId);

    if (error || !data || data.length === 0) return null;
    return data.map((r: any) => r.service_id);
  }

  /**
   * ✅ Lấy map { appointmentId -> serviceIds[] } cho nhiều appointments cùng lúc
   */
  private async getServiceIdMapByAppointmentIds(
    appointmentIds: string[],
  ): Promise<Record<string, string[]>> {
    if (!appointmentIds || appointmentIds.length === 0) return {};

    const { data, error } = await this.supabase
      .from('appointment_services')
      .select('appointment_id, service_id')
      .in('appointment_id', appointmentIds);

    if (error || !data) return {};

    const map: Record<string, string[]> = {};
    for (const row of data as any[]) {
      if (!map[row.appointment_id]) map[row.appointment_id] = [];
      map[row.appointment_id].push(row.service_id);
    }
    return map;
  }

  // ==================== HELPER METHODS ====================

  private calculateEndTime(startTime: string, durationMinutes: number): string {
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + durationMinutes;
    const endHours = Math.floor(totalMinutes / 60) % 24;
    const endMinutes = totalMinutes % 60;
    return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
  }

  private normalizeDate(value: Date | string | undefined, fieldName: string): Date {
    if (!value) {
      throw new BadRequestException(`Thiếu trường ngày hợp lệ: ${fieldName}`);
    }

    const dateValue = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(dateValue.getTime())) {
      throw new BadRequestException(`Giá trị ngày không hợp lệ cho trường ${fieldName}`);
    }

    return dateValue;
  }

  private toDateKey(value: Date): string {
    return value.toISOString().split('T')[0];
  }

  private toHHmm(value: string): string {
    return value.slice(0, 5);
  }

  private mapAppointmentFromDb(data: any, serviceIds?: string[] | null): Appointment {
    return {
      id: data.id,
      customerId: data.customer_id,
      stylistId: data.stylist_id,
      hairstyleId: data.hairstyle_id,
      // ✅ NEW
      serviceIds: serviceIds ?? null,
      appointmentDate: new Date(data.appointment_date),
      startTime: data.start_time,
      endTime: data.end_time,
      duration: data.duration,
      status: data.status as AppointmentStatus,
      customerName: data.customer_name,
      customerPhone: data.customer_phone,
      customerEmail: data.customer_email,
      notes: data.notes,
      cancellationReason: data.cancellation_reason,
      price: parseFloat(data.price),
      depositAmount: parseFloat(data.deposit_amount || 0),
      depositPaid: data.deposit_paid,
      reminderSent: data.reminder_sent,
      reminderSentAt: data.reminder_sent_at ? new Date(data.reminder_sent_at) : undefined,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      confirmedAt: data.confirmed_at ? new Date(data.confirmed_at) : undefined,
      cancelledAt: data.cancelled_at ? new Date(data.cancelled_at) : undefined,
      completedAt: data.completed_at ? new Date(data.completed_at) : undefined,
    };
  }

  private mapAppointmentDetailedFromDb(
    data: any,
    serviceIds?: string[] | null,
  ): AppointmentDetailed {
    // ✅ Parse services từ view (JSON array) và extract serviceIds
    let services: AppointmentServiceSummary[] | undefined;
    let resolvedServiceIds = serviceIds;

    if (data.services) {
      const rawServices = typeof data.services === 'string'
        ? JSON.parse(data.services)
        : data.services;

      if (Array.isArray(rawServices) && rawServices.length > 0) {
        services = rawServices.map((s: any) => ({
          id: s.id,
          name: s.name,
          price: parseFloat(s.price),
          duration: s.duration,
          category: s.category,
        }));
        // Nếu chưa có serviceIds thì extract từ services
        if (!resolvedServiceIds) {
          resolvedServiceIds = services.map(s => s.id);
        }
      }
    }

    return {
      ...this.mapAppointmentFromDb(data, resolvedServiceIds),
      stylistName: data.stylist_name,
      stylistAvatar: data.stylist_avatar,
      hairstyleName: data.hairstyle_name,
      hairstyleImage: data.hairstyle_image,
      customerFullName: data.customer_full_name,
      customerUserEmail: data.customer_user_email,
      customerUserPhone: data.customer_user_phone,
      services: services ?? [],
    };
  }

  // Cache invalidation
  private async invalidateAppointmentCache(id: string): Promise<void> {
    await this.redisService.delete(this.CACHE_KEYS.appointment(id));
  }

  private async invalidateAppointmentsCache(): Promise<void> {
    const client = this.redisService.getClient();
    const keys = await client.keys('appointments:list:*');
    if (keys.length > 0) await client.del(...keys);
  }

  private async invalidateAvailabilityCache(stylistId: string, date: Date): Promise<void> {
    const dateStr = date.toISOString().split('T')[0];
    await this.redisService.delete(this.CACHE_KEYS.availability(stylistId, dateStr));
  }
}