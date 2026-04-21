// libs/common/src/entities/booking.entity.ts

// Appointment Status Enum
export enum AppointmentStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
}

// Queue Status Enum
export enum QueueStatus {
  WAITING = 'waiting',
  CALLED = 'called',
  SERVING = 'serving',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

// Recurrence Type Enum
export enum RecurrenceType {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  BIWEEKLY = 'biweekly',
  MONTHLY = 'monthly',
}

// ✅ NEW: Summary thông tin service gắn với appointment
export interface AppointmentServiceSummary {
  id: string;
  name: string;
  price: number;
  duration: number;
  category?: string;
}

// Appointment Entity
export interface Appointment {
  id: string;
  customerId: string;
  stylistId: string;
  hairstyleId: string;

  // ✅ NEW: Danh sách service IDs (nullable - có thể không có service nào)
  serviceIds?: string[] | null;

  appointmentDate: Date;
  startTime: string;
  endTime: string;
  duration: number;

  status: AppointmentStatus;

  customerName: string;
  customerPhone: string;
  customerEmail?: string;

  notes?: string;
  cancellationReason?: string;

  price: number;
  depositAmount: number;
  depositPaid: boolean;

  reminderSent: boolean;
  reminderSentAt?: Date;

  createdAt: Date;
  updatedAt: Date;
  confirmedAt?: Date;
  cancelledAt?: Date;
  completedAt?: Date;
}

// Appointment with details (joined data)
export interface AppointmentDetailed extends Appointment {
  stylistName: string;
  stylistAvatar?: string;
  hairstyleName: string;
  hairstyleImage: string;
  customerFullName: string;
  customerUserEmail: string;
  customerUserPhone: string;

  // ✅ NEW: Chi tiết các services (từ view appointments_detailed)
  services?: AppointmentServiceSummary[];
}

// Stylist Schedule Entity
export interface StylistSchedule {
  id: string;
  stylistId: string;
  stylistName?: string;
  stylistAvatar?: string;
  workDate: Date;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  isDayOff: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Break Time Entity
export interface BreakTime {
  id: string;
  scheduleId: string;
  breakStart: string;
  breakEnd: string;
  reason?: string;
  createdAt: Date;
}

// Queue Entity
export interface AppointmentQueue {
  id: string;
  appointmentId: string;
  queuePosition: number;
  estimatedStartTime?: Date;
  estimatedWaitMinutes: number;
  status: QueueStatus;
  notified: boolean;
  notifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Recurring Appointment Entity
export interface RecurringAppointment {
  id: string;
  customerId: string;
  stylistId: string;
  hairstyleId: string;
  recurrenceType: RecurrenceType;
  startDate: Date;
  endDate?: Date;
  preferredTime: string;
  duration: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Blackout Date Entity
export interface BlackoutDate {
  id: string;
  blackoutDate: Date;
  title: string;
  description?: string;
  appliesToAll: boolean;
  stylistId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Time Slot
export interface TimeSlot {
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  duration: number;
}

// Available Slot with Stylist Info
export interface AvailableSlot {
  stylistId: string;
  stylistName: string;
  date: Date;
  slots: TimeSlot[];
}

// Appointment Stats
export interface AppointmentStats {
  total: number;
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  noShow: number;
  todayAppointments: number;
  upcomingAppointments: number;
}