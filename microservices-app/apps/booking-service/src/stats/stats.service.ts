import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GetStatsDto, StatsPeriod } from './dto/stats.dto';

// ─────────────────────────────────────────────
// Return-type interfaces (used by controller)
// ─────────────────────────────────────────────

export interface ChartPoint {
  /** Label hiển thị trên trục X: "T2", "01/07", "Tháng 1" … */
  label: string;
  /** ISO date string – dùng để FE tooltip hoặc sort */
  date: string;
  /** Tổng số appointment nhận được trong khoảng này */
  totalAppointments: number;
  /** Doanh thu từ appointment đã COMPLETED */
  completedRevenue: number;
  /** Doanh thu đặt cọc từ appointment chưa hoàn thành */
  depositRevenue: number;
  /** Tổng doanh thu = completedRevenue + depositRevenue */
  totalRevenue: number;
}

export interface AdminStatsResult {
  /** Tổng quan kỳ hiện tại */
  summary: {
    totalAppointments: number;
    completedRevenue: number;
    depositRevenue: number;
    totalRevenue: number;
    totalStylists: number;
    totalCustomers: number;
  };
  /** Mảng điểm dữ liệu để vẽ biểu đồ */
  chart: ChartPoint[];
}

export interface StylistDayOff {
  label: string;
  date: string;
  isDayOff: boolean;
}

export interface StylistChartPoint extends ChartPoint {
  /** Số ngày nghỉ trong khoảng này */
  dayOffCount: number;
}

export interface StylistStatsResult {
  summary: {
    totalAppointments: number;
    completedRevenue: number;
    depositRevenue: number;
    totalRevenue: number;
    totalDayOffs: number;
  };
  chart: StylistChartPoint[];
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Tạo danh sách các "bucket" theo tuần / tháng / năm.
 * Mỗi bucket là { start, end } theo UTC 00:00.
 */
function buildBuckets(
  period: StatsPeriod,
  now: Date,
): Array<DateRange & { label: string }> {
  const buckets: Array<DateRange & { label: string }> = [];

  if (period === StatsPeriod.WEEK) {
    // 7 ngày gần nhất (hôm nay là ngày cuối)
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      const start = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
      );
      const end = new Date(start.getTime() + 86_400_000 - 1); // 23:59:59.999

      const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
      const label = `${dayNames[start.getUTCDay()]} ${String(start.getUTCDate()).padStart(2, '0')}/${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
      buckets.push({ start, end, label });
    }
  } else if (period === StatsPeriod.MONTH) {
    // 4 tuần gần nhất
    for (let i = 3; i >= 0; i--) {
      const end = new Date(now);
      end.setUTCDate(end.getUTCDate() - i * 7);
      const endDay = new Date(
        Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 23, 59, 59, 999),
      );
      const startDay = new Date(endDay.getTime() - 7 * 86_400_000 + 1);
      const weekNum = 4 - i;
      const label = `Tuần ${weekNum} (${fmtDate(startDay)}–${fmtDate(endDay)})`;
      buckets.push({ start: startDay, end: endDay, label });
    }
  } else {
    // YEAR – 12 tháng gần nhất
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCMonth(d.getUTCMonth() - i, 1);
      const start = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1),
      );
      const end = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999),
      );
      const label = `T${start.getUTCMonth() + 1}/${start.getUTCFullYear()}`;
      buckets.push({ start, end, label });
    }
  }

  return buckets;
}

function fmtDate(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

@Injectable()
export class StatsService {
  private readonly supabase: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    this.supabase = createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_SERVICE_KEY'),
    );
  }

  // ═══════════════════════════════════════════
  // ADMIN
  // ═══════════════════════════════════════════

  async getAdminStats(dto: GetStatsDto, _adminId: string): Promise<AdminStatsResult> {
    const now = new Date();
    const buckets = buildBuckets(dto.period, now);

    // Lấy toàn bộ period (từ bucket đầu đến bucket cuối)
    const periodStart = buckets[0].start.toISOString();
    const periodEnd = buckets[buckets.length - 1].end.toISOString();

    // ── 1. Appointments trong kỳ ──
    let aptQuery = this.supabase
      .from('appointments')
      .select(
        'id, status, price, deposit_amount, deposit_paid, created_at, appointment_date',
      )
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    if (dto.branchId) {
      // appointments không có branch_id trực tiếp; join qua stylist nếu cần.
      // Để đơn giản, bỏ qua filter branch nếu schema chưa hỗ trợ.
    }

    const { data: appointments, error: aptError } = await aptQuery;
    if (aptError) throw new BadRequestException(`Lỗi lấy appointments: ${aptError.message}`);

    // ── 2. Tổng số stylist & customer ──
    const [{ count: totalStylists }, { count: totalCustomers }] =
      await Promise.all([
        this.supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'stylist'),
        this.supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'customer'),
      ]);

    // ── 3. Tính summary ──
    const apts = appointments ?? [];
    const completedRevenue = apts
      .filter((a) => a.status === 'completed')
      .reduce((s, a) => s + parseFloat(a.price ?? 0), 0);

    const depositRevenue = apts
      .filter((a) => a.status !== 'completed' && a.deposit_paid === true)
      .reduce((s, a) => s + parseFloat(a.deposit_amount ?? 0), 0);

    // ── 4. Xây dựng chart theo bucket ──
    const chart: ChartPoint[] = buckets.map((b) => {
      const inBucket = apts.filter((a) => {
        const t = new Date(a.created_at).getTime();
        return t >= b.start.getTime() && t <= b.end.getTime();
      });

      const bCompleted = inBucket
        .filter((a) => a.status === 'completed')
        .reduce((s, a) => s + parseFloat(a.price ?? 0), 0);

      const bDeposit = inBucket
        .filter((a) => a.status !== 'completed' && a.deposit_paid === true)
        .reduce((s, a) => s + parseFloat(a.deposit_amount ?? 0), 0);

      return {
        label: b.label,
        date: b.start.toISOString(),
        totalAppointments: inBucket.length,
        completedRevenue: Math.round(bCompleted),
        depositRevenue: Math.round(bDeposit),
        totalRevenue: Math.round(bCompleted + bDeposit),
      };
    });

    return {
      summary: {
        totalAppointments: apts.length,
        completedRevenue: Math.round(completedRevenue),
        depositRevenue: Math.round(depositRevenue),
        totalRevenue: Math.round(completedRevenue + depositRevenue),
        totalStylists: totalStylists ?? 0,
        totalCustomers: totalCustomers ?? 0,
      },
      chart,
    };
  }

  // ═══════════════════════════════════════════
  // STYLIST
  // ═══════════════════════════════════════════

  async getStylistStats(dto: GetStatsDto, userId: string): Promise<StylistStatsResult> {
    // Lấy stylist record từ user_id
    const { data: stylistRecord, error: sErr } = await this.supabase
      .from('stylists')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (sErr || !stylistRecord) {
      throw new BadRequestException(
        'Không tìm thấy thông tin stylist. Hãy chắc chắn tài khoản đã được liên kết với stylist.',
      );
    }

    const stylistId = stylistRecord.id;
    const now = new Date();
    const buckets = buildBuckets(dto.period, now);

    const periodStart = buckets[0].start.toISOString();
    const periodEnd = buckets[buckets.length - 1].end.toISOString();

    // ── 1. Appointments của stylist ──
    const { data: appointments, error: aptError } = await this.supabase
      .from('appointments')
      .select('id, status, price, deposit_amount, deposit_paid, created_at')
      .eq('stylist_id', stylistId)
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    if (aptError) throw new BadRequestException(`Lỗi lấy appointments: ${aptError.message}`);

    // ── 2. Ngày nghỉ của stylist ──
    const startDate = buckets[0].start.toISOString().split('T')[0];
    const endDate = buckets[buckets.length - 1].end.toISOString().split('T')[0];

    const { data: schedules, error: schedErr } = await this.supabase
      .from('stylist_schedules')
      .select('work_date, is_day_off, is_available')
      .eq('stylist_id', stylistId)
      .gte('work_date', startDate)
      .lte('work_date', endDate);

    if (schedErr) throw new BadRequestException(`Lỗi lấy lịch làm việc: ${schedErr.message}`);

    // Ngày nghỉ = is_day_off = true HOẶC is_available = false
    const dayOffDates = new Set(
      (schedules ?? [])
        .filter((s) => s.is_day_off === true || s.is_available === false)
        .map((s) => s.work_date as string),
    );

    // ── 3. Summary ──
    const apts = appointments ?? [];
    const completedRevenue = apts
      .filter((a) => a.status === 'completed')
      .reduce((s, a) => s + parseFloat(a.price ?? 0), 0);

    const depositRevenue = apts
      .filter((a) => a.status !== 'completed' && a.deposit_paid === true)
      .reduce((s, a) => s + parseFloat(a.deposit_amount ?? 0), 0);

    // ── 4. Chart ──
    const chart: StylistChartPoint[] = buckets.map((b) => {
      const inBucket = apts.filter((a) => {
        const t = new Date(a.created_at).getTime();
        return t >= b.start.getTime() && t <= b.end.getTime();
      });

      const bCompleted = inBucket
        .filter((a) => a.status === 'completed')
        .reduce((s, a) => s + parseFloat(a.price ?? 0), 0);

      const bDeposit = inBucket
        .filter((a) => a.status !== 'completed' && a.deposit_paid === true)
        .reduce((s, a) => s + parseFloat(a.deposit_amount ?? 0), 0);

      // Đếm ngày nghỉ trong bucket
      let dayOffCount = 0;
      const cursor = new Date(b.start);
      while (cursor <= b.end) {
        const dateStr = cursor.toISOString().split('T')[0];
        if (dayOffDates.has(dateStr)) dayOffCount++;
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }

      return {
        label: b.label,
        date: b.start.toISOString(),
        totalAppointments: inBucket.length,
        completedRevenue: Math.round(bCompleted),
        depositRevenue: Math.round(bDeposit),
        totalRevenue: Math.round(bCompleted + bDeposit),
        dayOffCount,
      };
    });

    return {
      summary: {
        totalAppointments: apts.length,
        completedRevenue: Math.round(completedRevenue),
        depositRevenue: Math.round(depositRevenue),
        totalRevenue: Math.round(completedRevenue + depositRevenue),
        totalDayOffs: dayOffDates.size,
      },
      chart,
    };
  }
}