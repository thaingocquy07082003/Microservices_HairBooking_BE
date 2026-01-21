// Kafka Topics
export enum KafkaTopics {
  // User Events
  USER_REGISTERED = 'user.registered',
  USER_VERIFIED = 'user.verified',
  USER_UPDATED = 'user.updated',
  USER_DELETED = 'user.deleted',
  USER_LOGGED_IN = 'user.logged_in',
  USER_LOGGED_OUT = 'user.logged_out',

  // OTP Events
  OTP_SENT = 'otp.sent',
  OTP_VERIFIED = 'otp.verified',

  // Email Events
  EMAIL_SENT = 'email.sent',
  EMAIL_FAILED = 'email.failed',

  // Notification Events
  NOTIFICATION_SEND = 'notification.send',
  NOTIFICATION_SENT = 'notification.sent',

  // Booking Events
  BOOKING_CREATED = 'booking.created',
  BOOKING_UPDATED = 'booking.updated',
  BOOKING_CANCELLED = 'booking.cancelled',
  BOOKING_COMPLETED = 'booking.completed',

  // Payment Events
  PAYMENT_INITIATED = 'payment.initiated',
  PAYMENT_COMPLETED = 'payment.completed',
  PAYMENT_FAILED = 'payment.failed',
  PAYMENT_REFUNDED = 'payment.refunded',
}

// Base Event Interface
export interface BaseEvent {
  timestamp: Date;
  eventId?: string;
  correlationId?: string;
}

// User Events
export interface UserRegisteredEvent extends BaseEvent {
  userId: string;
  email: string;
  fullName: string;
  phone?: string;
  role?: string;
}

export interface UserVerifiedEvent extends BaseEvent {
  userId: string;
  email: string;
}

export interface UserLoggedInEvent extends BaseEvent {
  userId: string;
  email: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface UserLoggedOutEvent extends BaseEvent {
  userId: string;
  email: string;
}

export interface UserUpdatedEvent extends BaseEvent {
  userId: string;
  email: string;
  changes: Record<string, any>;
}

// OTP Events
export interface OtpSentEvent extends BaseEvent {
  email: string;
  otp: string;
  purpose: 'registration' | 'login' | 'reset_password' | 'verification';
  expiresAt: Date;
}

export interface OtpVerifiedEvent extends BaseEvent {
  email: string;
  purpose: 'registration' | 'login' | 'reset_password' | 'verification';
}

// Email Events
export interface EmailSentEvent extends BaseEvent {
  to: string;
  subject: string;
  template: string;
}

export interface EmailFailedEvent extends BaseEvent {
  to: string;
  subject: string;
  error: string;
}

// Notification Events
export interface NotificationSendEvent extends BaseEvent {
  userId: string;
  type: 'email' | 'sms' | 'push';
  title: string;
  message: string;
  data?: Record<string, any>;
}

// Booking Events
export interface BookingCreatedEvent extends BaseEvent {
  bookingId: string;
  userId: string;
  salonId: string;
  services: string[];
  appointmentTime: Date;
  totalAmount: number;
}

export interface BookingUpdatedEvent extends BaseEvent {
  bookingId: string;
  changes: Record<string, any>;
}

export interface BookingCancelledEvent extends BaseEvent {
  bookingId: string;
  userId: string;
  reason?: string;
}

// Payment Events
export interface PaymentInitiatedEvent extends BaseEvent {
  paymentId: string;
  bookingId: string;
  userId: string;
  amount: number;
  currency: string;
  method: string;
}

export interface PaymentCompletedEvent extends BaseEvent {
  paymentId: string;
  bookingId: string;
  userId: string;
  amount: number;
  transactionId: string;
}

export interface PaymentFailedEvent extends BaseEvent {
  paymentId: string;
  bookingId: string;
  userId: string;
  error: string;
}
