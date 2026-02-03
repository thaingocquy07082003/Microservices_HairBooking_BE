import { 
  Injectable, 
  NotFoundException, 
  BadRequestException,
  ConflictException 
} from '@nestjs/common';
import { RedisService } from '@app/redis';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import {
  Appointment,
  AppointmentDetailed,
  AppointmentStatus,
  AppointmentStats,
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
  
  // Cache TTL
  private readonly CACHE_TTL = {
    APPOINTMENT: 1800,      // 30 minutes
    LIST: 600,              // 10 minutes
    AVAILABILITY: 300,      // 5 minutes
  };

  // Cache keys
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
    // Calculate end time
    const endTime = this.calculateEndTime(dto.startTime, dto.duration);

    // Check if stylist is available
    const isAvailable = await this.checkStylistAvailability({
      stylistId: dto.stylistId,
      date: dto.appointmentDate,
      duration: dto.duration,
      startTime: dto.startTime,
      endTime: endTime
    });

    if (!isAvailable) {
      throw new ConflictException(
        'Thợ cắt tóc không khả dụng tại thời điểm này. Vui lòng chọn thời gian khác ' + ' DATE:' + dto.appointmentDate.toISOString().split('T')[0] + ' TIME:' + dto.startTime
      );
    }

    // Verify hairstyle exists and get price
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
        appointment_date: dto.appointmentDate.toISOString().split('T')[0],
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

    // Invalidate cache
    await this.invalidateAppointmentsCache();
    await this.invalidateAvailabilityCache(dto.stylistId, dto.appointmentDate);

    return this.mapAppointmentFromDb(appointment);
  }

  // ==================== GET APPOINTMENT ====================

  async getAppointmentById(id: string, includeDetails: boolean = false): Promise<Appointment | AppointmentDetailed> {
    // Try cache first
    const cacheKey = this.CACHE_KEYS.appointment(id);
    const cached = await this.redisService.get<Appointment>(cacheKey);
    if (cached && !includeDetails) {
      return cached;
    }

    let query = this.supabase.from('appointments').select('*');

    if (includeDetails) {
      query = this.supabase
        .from('appointments_detailed')
        .select('*');
    }

    const { data, error } = await query.eq('id', id).single();

    if (error || !data) {
      throw new NotFoundException(`Không tìm thấy lịch hẹn với ID: ${id}`);
    }

    const appointment = includeDetails 
      ? this.mapAppointmentDetailedFromDb(data)
      : this.mapAppointmentFromDb(data);

    // Cache result
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
    // Create cache key based on filter
    const filterKey = JSON.stringify(filter);
    const cacheKey = this.CACHE_KEYS.appointmentsList(filterKey);
    
    // Try cache first
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    // Choose table based on includeDetails
    const tableName = filter.includeDetails ? 'appointments_detailed' : 'appointments';
    
    // Build query
    let query = this.supabase
      .from(tableName)
      .select('*', { count: 'exact' });

    // Apply filters
    if (filter.status) {
      query = query.eq('status', filter.status);
    }
    if (filter.customerId) {
      query = query.eq('customer_id', filter.customerId);
    }
    if (filter.stylistId) {
      query = query.eq('stylist_id', filter.stylistId);
    }
    if (filter.hairstyleId) {
      query = query.eq('hairstyle_id', filter.hairstyleId);
    }
    if (filter.dateFrom) {
      query = query.gte('appointment_date', filter.dateFrom.toISOString().split('T')[0]);
    }
    if (filter.dateTo) {
      query = query.lte('appointment_date', filter.dateTo.toISOString().split('T')[0]);
    }
    if (filter.search) {
      query = query.or(
        `customer_name.ilike.%${filter.search}%,customer_phone.ilike.%${filter.search}%`
      );
    }

    // Sorting
    const sortBy = filter.sortBy || 'appointment_date';
    const order = filter.order || 'asc';
    
    const dbSortBy = sortBy === 'appointmentDate' ? 'appointment_date' : 
                     sortBy === 'startTime' ? 'start_time' :
                     sortBy === 'createdAt' ? 'created_at' : sortBy;
    
    query = query.order(dbSortBy, { ascending: order === 'asc' });
    
    // If sorting by date, also sort by time
    if (dbSortBy === 'appointment_date') {
      query = query.order('start_time', { ascending: order === 'asc' });
    }

    // Pagination
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const offset = (page - 1) * limit;
    
    query = query.range(offset, offset + limit - 1);

    // Execute query
    const { data, count, error } = await query;

    if (error) {
      throw new BadRequestException(`Lỗi khi lấy danh sách lịch hẹn: ${error.message}`);
    }

    const appointments = (data || []).map(a => 
      filter.includeDetails 
        ? this.mapAppointmentDetailedFromDb(a)
        : this.mapAppointmentFromDb(a)
    );

    const result = {
      data: appointments,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };

    // Cache result
    await this.redisService.set(cacheKey, result, this.CACHE_TTL.LIST);

    return result;
  }

  // ==================== UPDATE APPOINTMENT ====================

  async updateAppointment(id: string, dto: UpdateAppointmentDto): Promise<Appointment> {
    // Verify appointment exists
    const existing = await this.getAppointmentById(id) as Appointment;

    // If reschedule (date/time/stylist change), check availability
    if (dto.appointmentDate || dto.startTime || dto.stylistId) {
      const checkDate = dto.appointmentDate || existing.appointmentDate;
      const checkStylist = dto.stylistId || existing.stylistId;
      const checkDuration = dto.duration || existing.duration;

      const isAvailable = await this.checkStylistAvailability({
        stylistId: checkStylist,
        date: checkDate,
        duration: checkDuration,
        excludeAppointmentId: id,
        startTime: dto.startTime || existing.startTime,
        endTime: this.calculateEndTime(dto.startTime || existing.startTime, checkDuration),
      });

      if (!isAvailable) {
        throw new ConflictException('Thợ cắt tóc không khả dụng tại thời điểm mới');
      }
    }

    // Build update data
    const updateData: any = {};
    if (dto.stylistId) updateData.stylist_id = dto.stylistId;
    if (dto.hairstyleId) updateData.hairstyle_id = dto.hairstyleId;
    if (dto.appointmentDate) updateData.appointment_date = dto.appointmentDate.toISOString().split('T')[0];
    if (dto.startTime) {
      updateData.start_time = dto.startTime;
      updateData.end_time = this.calculateEndTime(dto.startTime, dto.duration || existing.duration);
    }
    if (dto.duration) {
      updateData.duration = dto.duration;
      updateData.end_time = this.calculateEndTime(dto.startTime || existing.startTime, dto.duration);
    }
    if (dto.customerName) updateData.customer_name = dto.customerName;
    if (dto.customerPhone) updateData.customer_phone = dto.customerPhone;
    if (dto.customerEmail !== undefined) updateData.customer_email = dto.customerEmail;
    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.status) {
      updateData.status = dto.status;
      if (dto.status === AppointmentStatus.CONFIRMED) {
        updateData.confirmed_at = new Date().toISOString();
      } else if (dto.status === AppointmentStatus.CANCELLED) {
        updateData.cancelled_at = new Date().toISOString();
      } else if (dto.status === AppointmentStatus.COMPLETED) {
        updateData.completed_at = new Date().toISOString();
      }
    }
    if (dto.price !== undefined) updateData.price = dto.price;
    if (dto.depositAmount !== undefined) updateData.deposit_amount = dto.depositAmount;
    if (dto.depositPaid !== undefined) updateData.deposit_paid = dto.depositPaid;

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('Không có dữ liệu để cập nhật');
    }

    // Update appointment
    const { data: appointment, error } = await this.supabase
      .from('appointments')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi cập nhật lịch hẹn: ${error.message}`);
    }

    // Invalidate cache
    await this.invalidateAppointmentCache(id);
    await this.invalidateAppointmentsCache();
    await this.invalidateAvailabilityCache(existing.stylistId, existing.appointmentDate);
    if (dto.stylistId && dto.stylistId !== existing.stylistId) {
      await this.invalidateAvailabilityCache(dto.stylistId, dto.appointmentDate || existing.appointmentDate);
    }

    return this.mapAppointmentFromDb(appointment);
  }

  // ==================== CANCEL APPOINTMENT ====================

  async cancelAppointment(id: string, dto: CancelAppointmentDto): Promise<Appointment> {
    const existing = await this.getAppointmentById(id) as Appointment;

    // Check if can cancel
    if ([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED].includes(existing.status)) {
      throw new BadRequestException(`Không thể hủy lịch hẹn đã ${existing.status === AppointmentStatus.COMPLETED ? 'hoàn thành' : 'hủy'}`);
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

    // Invalidate cache
    await this.invalidateAppointmentCache(id);
    await this.invalidateAppointmentsCache();
    await this.invalidateAvailabilityCache(existing.stylistId, existing.appointmentDate);

    return this.mapAppointmentFromDb(appointment);
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

    // TODO: Send notification if dto.sendNotification = true

    await this.invalidateAppointmentCache(id);
    await this.invalidateAppointmentsCache();

    return this.mapAppointmentFromDb(appointment);
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
    if (dto.notes) updateData.notes = dto.notes;

    const { data: appointment, error } = await this.supabase
      .from('appointments')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi hoàn thành lịch hẹn: ${error.message}`);
    }

    // TODO: Handle rating if provided
    if (dto.rating) {
      // Update stylist rating
      // This should be handled by a separate rating service
    }

    await this.invalidateAppointmentCache(id);
    await this.invalidateAppointmentsCache();

    return this.mapAppointmentFromDb(appointment);
  }

  // ==================== CHECK AVAILABILITY ====================

  async checkStylistAvailability(dto: CheckAvailabilityDto): Promise<boolean> {
    const { data, error } = await this.supabase
      .rpc('is_stylist_available', {
        p_stylist_id: dto.stylistId,
        p_date: dto.date.toISOString().split('T')[0],
        p_start_time: dto.startTime,
        p_end_time: this.calculateEndTime(dto.startTime, dto.duration),
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
    if (cached) {
      return cached;
    }

    let query = this.supabase.from('appointments').select('status, appointment_date', { count: 'exact' });

    if (filter.dateFrom) {
      query = query.gte('appointment_date', filter.dateFrom.toISOString().split('T')[0]);
    }
    if (filter.dateTo) {
      query = query.lte('appointment_date', filter.dateTo.toISOString().split('T')[0]);
    }
    if (filter.stylistId) {
      query = query.eq('stylist_id', filter.stylistId);
    }
    if (filter.customerId) {
      query = query.eq('customer_id', filter.customerId);
    }

    const { data, count, error } = await query;

    if (error) {
      throw new BadRequestException(`Lỗi khi lấy thống kê: ${error.message}`);
    }

    const today = new Date().toISOString().split('T')[0];

    const stats: AppointmentStats = {
      total: count || 0,
      pending: data?.filter(a => a.status === AppointmentStatus.PENDING).length || 0,
      confirmed: data?.filter(a => a.status === AppointmentStatus.CONFIRMED).length || 0,
      completed: data?.filter(a => a.status === AppointmentStatus.COMPLETED).length || 0,
      cancelled: data?.filter(a => a.status === AppointmentStatus.CANCELLED).length || 0,
      noShow: data?.filter(a => a.status === AppointmentStatus.NO_SHOW).length || 0,
      todayAppointments: data?.filter(a => a.appointment_date === today).length || 0,
      upcomingAppointments: data?.filter(a => a.appointment_date > today).length || 0,
    };

    await this.redisService.set(cacheKey, stats, this.CACHE_TTL.LIST);

    return stats;
  }

  // ==================== HELPER METHODS ====================

  private calculateEndTime(startTime: string, durationMinutes: number): string {
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + durationMinutes;
    const endHours = Math.floor(totalMinutes / 60) % 24;
    const endMinutes = totalMinutes % 60;
    return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
  }

  private getCurrentTimeString(): string {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  private mapAppointmentFromDb(data: any): Appointment {
    return {
      id: data.id,
      customerId: data.customer_id,
      stylistId: data.stylist_id,
      hairstyleId: data.hairstyle_id,
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

  private mapAppointmentDetailedFromDb(data: any): AppointmentDetailed {
    return {
      ...this.mapAppointmentFromDb(data),
      stylistName: data.stylist_name,
      stylistAvatar: data.stylist_avatar,
      hairstyleName: data.hairstyle_name,
      hairstyleImage: data.hairstyle_image,
      customerFullName: data.customer_full_name,
      customerUserEmail: data.customer_user_email,
      customerUserPhone: data.customer_user_phone,
    };
  }

  // Cache invalidation
  private async invalidateAppointmentCache(id: string): Promise<void> {
    await this.redisService.delete(this.CACHE_KEYS.appointment(id));
  }

  private async invalidateAppointmentsCache(): Promise<void> {
    const client = this.redisService.getClient();
    const keys = await client.keys('appointments:list:*');
    if (keys.length > 0) {
      await client.del(...keys);
    }
  }

  private async invalidateAvailabilityCache(stylistId: string, date: Date): Promise<void> {
    const dateStr = date.toISOString().split('T')[0];
    await this.redisService.delete(this.CACHE_KEYS.availability(stylistId, dateStr));
  }
}