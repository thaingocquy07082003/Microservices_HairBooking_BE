-- ============================================
-- BOOKING SERVICE - SEED DATA
-- ============================================

-- ============================================
-- BƯỚC 1: TẠO USER ACCOUNTS (GIẢ ĐỊNH)
-- ============================================
-- Lưu ý: Các user này cần được tạo qua Auth Service trước
-- Đây chỉ là reference IDs cho seed data

-- Customer IDs (giả định đã tồn tại trong auth.users)
-- customer_1: 'a1b2c3d4-e5f6-4789-a012-bcdef1234567'
-- customer_2: 'b2c3d4e5-f6a7-4890-b123-cdef12345678'
-- customer_3: 'c3d4e5f6-a7b8-4901-c234-def123456789'

-- ============================================
-- BƯỚC 2: TẠO PROFILES (Nếu chưa có)
-- ============================================

-- Giả sử đã có profiles từ auth-service, nhưng cần verify:
/*
INSERT INTO public.profiles (id, email, full_name, phone, role, verified) VALUES
('a1b2c3d4-e5f6-4789-a012-bcdef1234567', 'customer1@test.com', 'Nguyễn Văn A', '0901234567', 'customer', true),
('b2c3d4e5-f6a7-4890-b123-cdef12345678', 'customer2@test.com', 'Trần Thị B', '0902234567', 'customer', true),
('c3d4e5f6-a7b8-4901-c234-def123456789', 'customer3@test.com', 'Lê Văn C', '0903234567', 'customer', true)
ON CONFLICT (id) DO NOTHING;
*/

-- ============================================
-- BƯỚC 3: TẠO STYLISTS (Thợ cắt tóc)
-- ============================================

-- Giả sử có 3 stylists trong hệ thống từ user-service
-- Lấy 3 stylists đầu tiên từ bảng stylists
DO $$
DECLARE
  stylist_1_id UUID;
  stylist_2_id UUID;
  stylist_3_id UUID;
BEGIN
  -- Lấy stylist IDs (giả sử đã có từ user-service)
  SELECT id INTO stylist_1_id FROM stylists ORDER BY created_at LIMIT 1 OFFSET 0;
  SELECT id INTO stylist_2_id FROM stylists ORDER BY created_at LIMIT 1 OFFSET 1;
  SELECT id INTO stylist_3_id FROM stylists ORDER BY created_at LIMIT 1 OFFSET 2;

  -- Nếu không có stylists, tạo dummy data
  IF stylist_1_id IS NULL THEN
    INSERT INTO stylists (id, user_id, full_name, experience, specialties, rating, total_bookings, is_available)
    VALUES 
      ('d1e2f3a4-b5c6-4d78-9012-3456789abcde', 'd1e2f3a4-0000-0000-0000-000000000001', 'Trần Văn Nam', 5, ARRAY['Cắt tóc nam', 'Tạo kiểu', 'Nhuộm'], 4.8, 150, true),
      ('e2f3a4b5-c6d7-4e89-0123-456789abcdef', 'e2f3a4b5-0000-0000-0000-000000000002', 'Nguyễn Thị Lan', 3, ARRAY['Cắt tóc nữ', 'Uốn', 'Duỗi'], 4.6, 120, true),
      ('f3a4b5c6-d7e8-4f90-1234-56789abcdef0', 'f3a4b5c6-0000-0000-0000-000000000003', 'Phạm Minh Tuấn', 7, ARRAY['Cắt tóc nam', 'Cắt râu', 'Tạo kiểu'], 4.9, 200, true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ============================================
-- BƯỚC 4: TẠO LỊCH LÀM VIỆC CHO STYLISTS
-- ============================================

-- Lấy 7 ngày từ hôm nay
DO $$
DECLARE
  stylist_1_id UUID := 'd1e2f3a4-b5c6-4d78-9012-3456789abcde';
  stylist_2_id UUID := 'e2f3a4b5-c6d7-4e89-0123-456789abcdef';
  stylist_3_id UUID := 'f3a4b5c6-d7e8-4f90-1234-56789abcdef0';
  current_date DATE;
  i INTEGER;
BEGIN
  -- Tạo lịch cho 7 ngày tới (từ hôm nay)
  FOR i IN 0..6 LOOP
    current_date := CURRENT_DATE + i;
    
    -- Stylist 1: Làm việc 9:00 - 18:00
    INSERT INTO stylist_schedules (stylist_id, work_date, start_time, end_time, is_available, is_day_off)
    VALUES (stylist_1_id, current_date, '09:00', '18:00', true, false)
    ON CONFLICT (stylist_id, work_date) DO NOTHING;
    
    -- Stylist 2: Làm việc 10:00 - 19:00
    INSERT INTO stylist_schedules (stylist_id, work_date, start_time, end_time, is_available, is_day_off)
    VALUES (stylist_2_id, current_date, '10:00', '19:00', true, false)
    ON CONFLICT (stylist_id, work_date) DO NOTHING;
    
    -- Stylist 3: Làm việc 8:00 - 17:00 (trừ chủ nhật - day 0)
    IF EXTRACT(DOW FROM current_date) != 0 THEN
      INSERT INTO stylist_schedules (stylist_id, work_date, start_time, end_time, is_available, is_day_off)
      VALUES (stylist_3_id, current_date, '08:00', '17:00', true, false)
      ON CONFLICT (stylist_id, work_date) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- ============================================
-- BƯỚC 5: THÊM BREAK TIMES (Giờ nghỉ trưa)
-- ============================================

DO $$
DECLARE
  schedule_record RECORD;
BEGIN
  -- Thêm giờ nghỉ trưa 12:00-13:00 cho tất cả lịch
  FOR schedule_record IN 
    SELECT id FROM stylist_schedules WHERE work_date >= CURRENT_DATE
  LOOP
    INSERT INTO stylist_break_times (schedule_id, break_start, break_end, reason)
    VALUES (schedule_record.id, '12:00', '13:00', 'Nghỉ trưa')
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- ============================================
-- BƯỚC 6: TẠO BLACKOUT DATES (Ngày nghỉ lễ)
-- ============================================

-- Thêm một số ngày nghỉ lễ (ví dụ: Tết Nguyên Đán 2026)
INSERT INTO blackout_dates (blackout_date, title, description, applies_to_all)
VALUES 
  ('2026-01-29', 'Tết Nguyên Đán - Mùng 1', 'Nghỉ Tết Nguyên Đán', true),
  ('2026-01-30', 'Tết Nguyên Đán - Mùng 2', 'Nghỉ Tết Nguyên Đán', true),
  ('2026-01-31', 'Tết Nguyên Đán - Mùng 3', 'Nghỉ Tết Nguyên Đán', true),
  ('2026-04-30', 'Ngày Giải phóng miền Nam', 'Nghỉ lễ', true),
  ('2026-05-01', 'Ngày Quốc tế Lao động', 'Nghỉ lễ', true)
ON CONFLICT (blackout_date, stylist_id) DO NOTHING;

-- ============================================
-- BƯỚC 7: TẠO APPOINTMENTS MẪU
-- ============================================

DO $$
DECLARE
  customer_1_id UUID := 'a1b2c3d4-e5f6-4789-a012-bcdef1234567';
  customer_2_id UUID := 'b2c3d4e5-f6a7-4890-b123-cdef12345678';
  customer_3_id UUID := 'c3d4e5f6-a7b8-4901-c234-def123456789';
  stylist_1_id UUID := 'd1e2f3a4-b5c6-4d78-9012-3456789abcde';
  stylist_2_id UUID := 'e2f3a4b5-c6d7-4e89-0123-456789abcdef';
  stylist_3_id UUID := 'f3a4b5c6-d7e8-4f90-1234-56789abcdef0';
  hairstyle_1_id UUID;
  hairstyle_2_id UUID;
  hairstyle_3_id UUID;
  tomorrow DATE := CURRENT_DATE + 1;
  today DATE := CURRENT_DATE;
BEGIN
  -- Lấy hairstyle IDs
  SELECT id INTO hairstyle_1_id FROM hairstyles WHERE category = 'men_short' LIMIT 1;
  SELECT id INTO hairstyle_2_id FROM hairstyles WHERE category = 'women_long' LIMIT 1;
  SELECT id INTO hairstyle_3_id FROM hairstyles WHERE category = 'men_medium' LIMIT 1;

  -- Appointment 1: Hôm nay, 10:00, đã confirmed
  INSERT INTO appointments (
    customer_id, stylist_id, hairstyle_id,
    appointment_date, start_time, end_time, duration,
    customer_name, customer_phone, customer_email,
    price, status, confirmed_at
  ) VALUES (
    customer_1_id, stylist_1_id, hairstyle_1_id,
    today, '10:00', '10:45', 45,
    'Nguyễn Văn A', '0901234567', 'customer1@test.com',
    150000, 'confirmed', NOW()
  );

  -- Appointment 2: Hôm nay, 14:00, đang pending
  INSERT INTO appointments (
    customer_id, stylist_id, hairstyle_id,
    appointment_date, start_time, end_time, duration,
    customer_name, customer_phone, customer_email,
    price, status, notes
  ) VALUES (
    customer_2_id, stylist_2_id, hairstyle_2_id,
    today, '14:00', '15:15', 75,
    'Trần Thị B', '0902234567', 'customer2@test.com',
    300000, 'pending', 'Muốn cắt ngắn và nhuộm highlight'
  );

  -- Appointment 3: Ngày mai, 9:00, đã confirmed
  INSERT INTO appointments (
    customer_id, stylist_id, hairstyle_id,
    appointment_date, start_time, end_time, duration,
    customer_name, customer_phone, customer_email,
    price, deposit_amount, deposit_paid, status, confirmed_at
  ) VALUES (
    customer_3_id, stylist_3_id, hairstyle_3_id,
    tomorrow, '09:00', '10:00', 60,
    'Lê Văn C', '0903234567', 'customer3@test.com',
    200000, 50000, true, 'confirmed', NOW()
  );

  -- Appointment 4: Ngày mai, 11:00, pending (để test booking)
  INSERT INTO appointments (
    customer_id, stylist_id, hairstyle_id,
    appointment_date, start_time, end_time, duration,
    customer_name, customer_phone, customer_email,
    price, status
  ) VALUES (
    customer_1_id, stylist_1_id, hairstyle_1_id,
    tomorrow, '11:00', '11:45', 45,
    'Nguyễn Văn A', '0901234567', 'customer1@test.com',
    150000, 'pending'
  );

  -- Appointment 5: Hôm qua, đã completed (để test history)
  INSERT INTO appointments (
    customer_id, stylist_id, hairstyle_id,
    appointment_date, start_time, end_time, duration,
    customer_name, customer_phone, customer_email,
    price, status, confirmed_at, completed_at
  ) VALUES (
    customer_2_id, stylist_2_id, hairstyle_2_id,
    CURRENT_DATE - 1, '15:00', '16:15', 75,
    'Trần Thị B', '0902234567', 'customer2@test.com',
    300000, 'completed', NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 hours'
  );

  -- Appointment 6: Hôm qua, bị cancelled
  INSERT INTO appointments (
    customer_id, stylist_id, hairstyle_id,
    appointment_date, start_time, end_time, duration,
    customer_name, customer_phone, customer_email,
    price, status, cancellation_reason, cancelled_at
  ) VALUES (
    customer_3_id, stylist_1_id, hairstyle_3_id,
    CURRENT_DATE - 1, '16:00', '17:00', 60,
    'Lê Văn C', '0903234567', 'customer3@test.com',
    200000, 'cancelled', 'Có việc đột xuất', NOW() - INTERVAL '1 day'
  );

  RAISE NOTICE 'Đã tạo 6 appointments mẫu';
END $$;

-- ============================================
-- BƯỚC 8: TẠO QUEUE (Hàng đợi) CHO HÔM NAY
-- ============================================

DO $$
DECLARE
  apt_confirmed_id UUID;
BEGIN
  -- Lấy appointment đã confirmed hôm nay
  SELECT id INTO apt_confirmed_id 
  FROM appointments 
  WHERE appointment_date = CURRENT_DATE 
    AND status = 'confirmed' 
  LIMIT 1;

  -- Thêm vào queue
  IF apt_confirmed_id IS NOT NULL THEN
    INSERT INTO appointment_queue (
      appointment_id,
      queue_position,
      estimated_wait_minutes,
      status
    ) VALUES (
      apt_confirmed_id,
      1,
      15,
      'waiting'
    );
    
    RAISE NOTICE 'Đã thêm appointment vào queue';
  END IF;
END $$;

-- ============================================
-- BƯỚC 9: TẠO RECURRING APPOINTMENTS (Lịch định kỳ)
-- ============================================

DO $$
DECLARE
  customer_1_id UUID := 'a1b2c3d4-e5f6-4789-a012-bcdef1234567';
  stylist_1_id UUID := 'd1e2f3a4-b5c6-4d78-9012-3456789abcde';
  hairstyle_1_id UUID;
BEGIN
  SELECT id INTO hairstyle_1_id FROM hairstyles WHERE category = 'men_short' LIMIT 1;

  -- Tạo lịch cắt tóc định kỳ 2 tuần/lần
  INSERT INTO recurring_appointments (
    customer_id, stylist_id, hairstyle_id,
    recurrence_type, start_date, end_date,
    preferred_time, duration, is_active
  ) VALUES (
    customer_1_id, stylist_1_id, hairstyle_1_id,
    'biweekly', CURRENT_DATE, CURRENT_DATE + INTERVAL '6 months',
    '10:00', 45, true
  );

  RAISE NOTICE 'Đã tạo recurring appointment';
END $$;

-- ============================================
-- BƯỚC 10: VERIFY DATA
-- ============================================

-- Kiểm tra số lượng records đã tạo
DO $$
DECLARE
  schedule_count INTEGER;
  appointment_count INTEGER;
  queue_count INTEGER;
  blackout_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO schedule_count FROM stylist_schedules WHERE work_date >= CURRENT_DATE;
  SELECT COUNT(*) INTO appointment_count FROM appointments;
  SELECT COUNT(*) INTO queue_count FROM appointment_queue;
  SELECT COUNT(*) INTO blackout_count FROM blackout_dates;

  RAISE NOTICE '=====================================';
  RAISE NOTICE 'SEED DATA SUMMARY';
  RAISE NOTICE '=====================================';
  RAISE NOTICE 'Stylists: 3';
  RAISE NOTICE 'Schedules (next 7 days): %', schedule_count;
  RAISE NOTICE 'Appointments: %', appointment_count;
  RAISE NOTICE 'Queue items: %', queue_count;
  RAISE NOTICE 'Blackout dates: %', blackout_count;
  RAISE NOTICE 'Recurring appointments: 1';
  RAISE NOTICE '=====================================';
END $$;

-- ============================================
-- QUERIES ĐỂ XEM DỮ LIỆU
-- ============================================

-- Xem appointments hôm nay
SELECT 
  a.id,
  a.customer_name,
  a.appointment_date,
  a.start_time,
  a.end_time,
  a.status,
  s.full_name as stylist_name,
  h.name as hairstyle_name,
  a.price
FROM appointments a
JOIN stylists s ON a.stylist_id = s.id
JOIN hairstyles h ON a.hairstyle_id = h.id
WHERE a.appointment_date = CURRENT_DATE
ORDER BY a.start_time;

-- Xem lịch làm việc tuần này
SELECT 
  ss.work_date,
  s.full_name as stylist_name,
  ss.start_time,
  ss.end_time,
  ss.is_available,
  COUNT(a.id) as total_appointments
FROM stylist_schedules ss
JOIN stylists s ON ss.stylist_id = s.id
LEFT JOIN appointments a ON 
  a.stylist_id = ss.stylist_id 
  AND a.appointment_date = ss.work_date
  AND a.status NOT IN ('cancelled', 'no_show')
WHERE ss.work_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6
GROUP BY ss.id, ss.work_date, s.full_name, ss.start_time, ss.end_time, ss.is_available
ORDER BY ss.work_date, s.full_name;

-- Xem hàng đợi
SELECT 
  aq.queue_position,
  aq.status,
  a.customer_name,
  a.start_time,
  s.full_name as stylist_name
FROM appointment_queue aq
JOIN appointments a ON aq.appointment_id = a.id
JOIN stylists s ON a.stylist_id = s.id
ORDER BY aq.queue_position;

-- Xem appointment statistics
SELECT 
  status,
  COUNT(*) as count,
  SUM(price) as total_revenue
FROM appointments
WHERE appointment_date >= CURRENT_DATE - 7
GROUP BY status
ORDER BY status;