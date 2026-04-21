import { 
  Injectable, 
  NotFoundException, 
  BadRequestException 
} from '@nestjs/common';
import { RedisService } from '@app/redis';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { TimeSlot, AvailableSlot } from '@app/common/entities/booking.entity';
import { GetAvailableSlotsDto, CheckAvailabilityDto } from '../appointments/dto/appointment.dto';

@Injectable()
export class AvailabilityService {
  private supabase: SupabaseClient;
  
  private readonly CACHE_TTL = {
    SLOTS: 300, // 5 minutes
  };

  private readonly CACHE_KEYS = {
    availableSlots: (date: string, stylistId?: string) => 
      `slots:${date}${stylistId ? `:${stylistId}` : ''}`,
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

  // ==================== GET AVAILABLE SLOTS ====================

  async getAvailableSlots(dto: GetAvailableSlotsDto): Promise<AvailableSlot[]> {
    const dateStr = dto.date!.toISOString().split('T')[0];
    const cacheKey = this.CACHE_KEYS.availableSlots(dateStr, dto.stylistId);
    
    const cached = await this.redisService.get<AvailableSlot[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Get schedules for the date
    let schedulesQuery = this.supabase
      .from('stylist_schedules')
      .select(`
        *,
        stylists (
          id,
          full_name,
          is_available
        ),
        stylist_break_times (
          break_start,
          break_end
        )
      `)
      .eq('work_date', dateStr)
      .eq('is_available', true)
      .eq('is_day_off', false);

    if (dto.stylistId) {
      schedulesQuery = schedulesQuery.eq('stylist_id', dto.stylistId);
    }

    const { data: schedules, error: scheduleError } = await schedulesQuery;

    if (scheduleError) {
      throw new BadRequestException(`Lỗi khi lấy lịch làm việc: ${scheduleError.message}`);
    }

    if (!schedules || schedules.length === 0) {
      return [];
    }

    // Check blackout dates
    const { data: blackouts } = await this.supabase
      .from('blackout_dates')
      .select('*')
      .eq('blackout_date', dateStr);

    const hasGeneralBlackout = blackouts?.some(b => b.applies_to_all) || false;

    // Get existing appointments for the date
    let appointmentsQuery = this.supabase
      .from('appointments')
      .select('stylist_id, start_time, end_time')
      .eq('appointment_date', dateStr)
      .not('status', 'in', '(cancelled,no_show)');

    if (dto.stylistId) {
      appointmentsQuery = appointmentsQuery.eq('stylist_id', dto.stylistId);
    }

    const { data: appointments } = await appointmentsQuery;

    // Build available slots for each stylist
    const availableSlots: AvailableSlot[] = [];

    for (const schedule of schedules) {
      const stylist = schedule.stylists;
      
      // Skip if stylist not available
      if (!stylist || !stylist.is_available) {
        continue;
      }

      // Skip if stylist-specific blackout
      const hasBlackout = hasGeneralBlackout || 
        blackouts?.some(b => b.stylist_id === schedule.stylist_id) || false;
      
      if (hasBlackout) {
        continue;
      }

      // Generate time slots
      const slots = this.generateTimeSlots(
        schedule.start_time,
        schedule.end_time,
        dto.duration || 30,
        dto.slotInterval || 30,
        schedule.stylist_break_times || [],
        appointments?.filter(a => a.stylist_id === schedule.stylist_id) || []
      );

      if (slots.length > 0) {
        availableSlots.push({
          stylistId: schedule.stylist_id,
          stylistName: stylist.full_name,
          date: dto.date!,
          slots: slots,
        });
      }
    }

    // Cache results
    await this.redisService.set(cacheKey, availableSlots, this.CACHE_TTL.SLOTS);

    return availableSlots;
  }

  // ==================== CHECK AVAILABILITY ====================

  async checkAvailability(dto: CheckAvailabilityDto): Promise<boolean> {
    const dateStr = dto.date!.toISOString().split('T')[0];
    
    // Check if schedule exists
    const { data: schedule } = await this.supabase
      .from('stylist_schedules')
      .select('*')
      .eq('stylist_id', dto.stylistId)
      .eq('work_date', dateStr)
      .eq('is_available', true)
      .eq('is_day_off', false)
      .single();

    if (!schedule) {
      return false;
    }

    // Check blackout dates
    const { data: blackouts } = await this.supabase
      .from('blackout_dates')
      .select('*')
      .eq('blackout_date', dateStr)
      .or(`applies_to_all.eq.true,stylist_id.eq.${dto.stylistId}`);

    if (blackouts && blackouts.length > 0) {
      return false;
    }

    // Use Supabase function to check
    const { data, error } = await this.supabase.rpc('is_stylist_available', {
      p_stylist_id: dto.stylistId,
      p_date: dateStr,
      p_start_time: this.getCurrentTimeString(),
      p_end_time: this.calculateEndTime(this.getCurrentTimeString(), dto.duration!),
      p_exclude_appointment_id: dto.excludeAppointmentId || null,
    });

    if (error) {
      console.error('Error checking availability:', error);
      return false;
    }

    return data === true;
  }

  // ==================== HELPER METHODS ====================

  private generateTimeSlots(
    startTime: string,
    endTime: string,
    serviceDuration: number,
    slotInterval: number,
    breakTimes: any[],
    existingAppointments: any[]
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];
    
    let currentTime = this.parseTime(startTime);
    const endTimeMinutes = this.parseTime(endTime);

    while (currentTime + serviceDuration <= endTimeMinutes) {
      const slotStart = this.formatTime(currentTime);
      const slotEnd = this.formatTime(currentTime + serviceDuration);

      // Check if slot overlaps with break times
      const overlapsBreak = breakTimes.some(bt => 
        this.timesOverlap(
          slotStart, slotEnd,
          bt.break_start, bt.break_end
        )
      );

      // Check if slot overlaps with existing appointments
      const overlapsAppointment = existingAppointments.some(apt => 
        this.timesOverlap(
          slotStart, slotEnd,
          apt.start_time, apt.end_time
        )
      );

      const isAvailable = !overlapsBreak && !overlapsAppointment;

      slots.push({
        startTime: slotStart,
        endTime: slotEnd,
        isAvailable: isAvailable,
        duration: serviceDuration,
      });

      currentTime += slotInterval;
    }

    return slots;
  }

  private parseTime(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  private timesOverlap(
    start1: string, 
    end1: string, 
    start2: string, 
    end2: string
  ): boolean {
    const s1 = this.parseTime(start1);
    const e1 = this.parseTime(end1);
    const s2 = this.parseTime(start2);
    const e2 = this.parseTime(end2);

    return (s1 < e2 && e1 > s2);
  }

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
}