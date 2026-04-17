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
  StylistSchedule,
  BreakTime,
  BlackoutDate,
} from '@app/common/entities/booking.entity';
import {
  CreateScheduleDto,
  UpdateScheduleDto,
  BulkCreateScheduleDto,
  GetSchedulesDto,
  CreateBlackoutDateDto,
  UpdateBlackoutDateDto,
} from './dto/scheduling.dto';

@Injectable()
export class SchedulingService {
  private supabase: SupabaseClient;
  
  private readonly CACHE_TTL = {
    SCHEDULE: 1800,
    LIST: 600,
  };

  private readonly CACHE_KEYS = {
    schedule: (id: string) => `schedule:${id}`,
    schedulesList: (filter: string) => `schedules:list:${filter}`,
    stylistSchedules: (stylistId: string, date: string) => `stylist:${stylistId}:schedule:${date}`,
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

  // ==================== CREATE SCHEDULE ====================

  async createSchedule(dto: CreateScheduleDto): Promise<StylistSchedule> {
    // Check if schedule already exists
    const { data: existing } = await this.supabase
      .from('stylist_schedules')
      .select('id')
      .eq('stylist_id', dto.stylistId)
      .eq('work_date', dto.workDate.toISOString().split('T')[0])
      .single();

    if (existing) {
      throw new ConflictException('Lịch làm việc cho ngày này đã tồn tại');
    }

    // Create schedule
    const { data: schedule, error } = await this.supabase
      .from('stylist_schedules')
      .insert({
        stylist_id: dto.stylistId,
        work_date: dto.workDate.toISOString().split('T')[0],
        start_time: dto.startTime,
        end_time: dto.endTime,
        is_available: dto.isAvailable ?? true,
        is_day_off: dto.isDayOff ?? false,
        notes: dto.notes,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi tạo lịch làm việc: ${error.message}`);
    }

    // Create break times if provided
    if (dto.breakTimes && dto.breakTimes.length > 0) {
      const breakTimesData = dto.breakTimes.map(bt => ({
        schedule_id: schedule.id,
        break_start: bt.breakStart,
        break_end: bt.breakEnd,
        reason: bt.reason,
      }));

      await this.supabase.from('stylist_break_times').insert(breakTimesData);
    }

    await this.invalidateSchedulesCaches(dto.stylistId);

    return this.mapScheduleFromDb(schedule);
  }

  // ==================== BULK CREATE SCHEDULES ====================
  // ✅ UPDATED: Hỗ trợ seed lịch cho NHIỀU stylist trong 1 lần gọi API
  
  async bulkCreateSchedules(dto: BulkCreateScheduleDto): Promise<StylistSchedule[]> {
    // Validate stylistIds tồn tại
    if (!dto.stylistIds || dto.stylistIds.length === 0) {
      throw new BadRequestException('Phải cung cấp ít nhất 1 stylistId');
    }

    // Loại bỏ duplicate IDs nếu có
    const uniqueStylistIds = [...new Set(dto.stylistIds)];

    // Pre-fetch tất cả stylists để validate tồn tại (tránh loop insert vào stylist không tồn tại)
    const { data: existingStylists, error: stylistsError } = await this.supabase
      .from('stylists')
      .select('id, full_name')
      .in('id', uniqueStylistIds);

    if (stylistsError) {
      throw new BadRequestException(`Lỗi khi kiểm tra stylists: ${stylistsError.message}`);
    }

    const existingIds = new Set((existingStylists ?? []).map(s => s.id));
    const missingIds = uniqueStylistIds.filter(id => !existingIds.has(id));
    if (missingIds.length > 0) {
      throw new NotFoundException(
        `Không tìm thấy các stylist: ${missingIds.join(', ')}`,
      );
    }

    const allCreatedSchedules: StylistSchedule[] = [];

    // Loop qua từng stylist
    for (const stylistId of uniqueStylistIds) {
      const currentDate = new Date(dto.startDate);
      const endDate = new Date(dto.endDate);

      while (currentDate <= endDate) {
        const dayOfWeek = currentDate.getDay();

        // Skip if not in workDays
        if (dto.workDays && !dto.workDays.includes(dayOfWeek)) {
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        // Skip if in excludeDates
        if (
          dto.excludeDates &&
          dto.excludeDates.some(
            (d) =>
              new Date(d).toISOString().split('T')[0] ===
              currentDate.toISOString().split('T')[0],
          )
        ) {
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        // Check if schedule already exists cho stylist + ngày này
        const { data: existing } = await this.supabase
          .from('stylist_schedules')
          .select('id')
          .eq('stylist_id', stylistId)
          .eq('work_date', currentDate.toISOString().split('T')[0])
          .maybeSingle();

        if (!existing) {
          try {
            const schedule = await this.createSchedule({
              stylistId,
              workDate: new Date(currentDate),
              startTime: dto.startTime,
              endTime: dto.endTime,
              breakTimes: dto.breakTimes,
            });
            allCreatedSchedules.push(schedule);
          } catch (error) {
            console.error(
              `Failed to create schedule for stylist=${stylistId}, date=${currentDate.toISOString().split('T')[0]}:`,
              error,
            );
            // tiếp tục loop, không throw để các ngày/stylist khác vẫn chạy
          }
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    return allCreatedSchedules;
  }

  // ==================== GET SCHEDULES ====================
  // ✅ UPDATED: Join với bảng stylists để trả về stylistName, stylistAvatar

  async getSchedules(filter: GetSchedulesDto): Promise<StylistSchedule[]> {
    const cacheKey = this.CACHE_KEYS.schedulesList(JSON.stringify(filter));
    const cached = await this.redisService.get<StylistSchedule[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Dùng nested select của Supabase để join qua FK stylist_id -> stylists.id
    let query = this.supabase
      .from('stylist_schedules')
      .select(`
        *,
        stylists:stylist_id (
          id,
          full_name,
          avatar_url
        )
      `);

    if (filter.stylistId) {
      query = query.eq('stylist_id', filter.stylistId);
    }
    if (filter.dateFrom) {
      query = query.gte('work_date', filter.dateFrom.toISOString().split('T')[0]);
    }
    if (filter.dateTo) {
      query = query.lte('work_date', filter.dateTo.toISOString().split('T')[0]);
    }
    if (filter.isAvailable !== undefined) {
      query = query.eq('is_available', filter.isAvailable);
    }
    if (filter.excludeDayOff) {
      query = query.eq('is_day_off', false);
    }

    query = query.order('work_date', { ascending: true });

    const { data, error } = await query;

    if (error) {
      throw new BadRequestException(`Lỗi khi lấy danh sách lịch làm việc: ${error.message}`);
    }

    const schedules = (data || []).map(s => this.mapScheduleFromDb(s));

    await this.redisService.set(cacheKey, schedules, this.CACHE_TTL.LIST);

    return schedules;
  }

  // ==================== UPDATE SCHEDULE ====================

  async updateSchedule(id: string, dto: UpdateScheduleDto): Promise<StylistSchedule> {
    const updateData: any = {};
    if (dto.startTime) updateData.start_time = dto.startTime;
    if (dto.endTime) updateData.end_time = dto.endTime;
    if (dto.isAvailable !== undefined) updateData.is_available = dto.isAvailable;
    if (dto.isDayOff !== undefined) updateData.is_day_off = dto.isDayOff;
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    const { data: schedule, error } = await this.supabase
      .from('stylist_schedules')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi cập nhật lịch làm việc: ${error.message}`);
    }

    // Update break times if provided
    if (dto.breakTimes) {
      await this.supabase.from('stylist_break_times').delete().eq('schedule_id', id);

      if (dto.breakTimes.length > 0) {
        const breakTimesData = dto.breakTimes.map(bt => ({
          schedule_id: id,
          break_start: bt.breakStart,
          break_end: bt.breakEnd,
          reason: bt.reason,
        }));

        await this.supabase.from('stylist_break_times').insert(breakTimesData);
      }
    }

    await this.invalidateSchedulesCaches(schedule.stylist_id);

    return this.mapScheduleFromDb(schedule);
  }

  // ==================== DELETE SCHEDULE ====================

  async deleteSchedule(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('stylist_schedules')
      .delete()
      .eq('id', id);

    if (error) {
      throw new BadRequestException(`Lỗi khi xóa lịch làm việc: ${error.message}`);
    }
  }

  // ==================== BLACKOUT DATES ====================

  async createBlackoutDate(dto: CreateBlackoutDateDto): Promise<BlackoutDate> {
    const { data: blackout, error } = await this.supabase
      .from('blackout_dates')
      .insert({
        blackout_date: dto.blackoutDate.toISOString().split('T')[0],
        title: dto.title,
        description: dto.description,
        applies_to_all: dto.appliesToAll ?? true,
        stylist_id: dto.stylistId,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Lỗi khi tạo ngày nghỉ: ${error.message}`);
    }

    return this.mapBlackoutDateFromDb(blackout);
  }

  async GetAllBlackoutDate(): Promise<BlackoutDate[]> {
    const { data: blackoutDates, error } = await this.supabase
      .from('blackout_dates')
      .select('*')
      .order('blackout_date', { ascending: true });

    if (error) {
      throw new BadRequestException(`Lỗi khi lấy danh sách ngày nghỉ: ${error.message}`);
    }
    return (blackoutDates || []).map(item => this.mapBlackoutDateFromDb(item));
  }

  // ==================== HELPER METHODS ====================

  /**
   * ✅ UPDATED: Map stylistName / stylistAvatar từ nested object khi có join,
   * fallback an toàn khi không join (dùng cho create/update chỉ trả về bảng gốc).
   */
  private mapScheduleFromDb(data: any): StylistSchedule {
    // Khi query có join, Supabase trả về object: data.stylists = { id, full_name, avatar_url }
    // Khi là array thì lấy phần tử đầu (phòng trường hợp không định nghĩa 1-1)
    const stylistRel = Array.isArray(data.stylists) ? data.stylists[0] : data.stylists;

    return {
      id: data.id,
      stylistId: data.stylist_id,
      stylistName: stylistRel?.full_name ?? undefined,
      stylistAvatar: stylistRel?.avatar_url ?? undefined,
      workDate: new Date(data.work_date),
      startTime: data.start_time,
      endTime: data.end_time,
      isAvailable: data.is_available,
      isDayOff: data.is_day_off,
      notes: data.notes,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  private mapBlackoutDateFromDb(data: any): BlackoutDate {
    return {
      id: data.id,
      blackoutDate: new Date(data.blackout_date),
      title: data.title,
      description: data.description,
      appliesToAll: data.applies_to_all,
      stylistId: data.stylist_id,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  private async invalidateSchedulesCaches(stylistId: string): Promise<void> {
    const client = this.redisService.getClient();
    const keys = await client.keys(`stylist:${stylistId}:schedule:*`);
    if (keys.length > 0) {
      await client.del(...keys);
    }
    
    const listKeys = await client.keys('schedules:list:*');
    if (listKeys.length > 0) {
      await client.del(...listKeys);
    }
  }
}