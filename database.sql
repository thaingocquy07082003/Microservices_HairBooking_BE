-- ========================================
-- 1. TẠO BẢNG PROFILES
-- ========================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin', 'staff', 'stylist','manager', 'superadmin')),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================================
-- 2. TẠO INDEX CHO PERFORMANCE
-- ========================================
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- ========================================
-- 3. ENABLE ROW LEVEL SECURITY (RLS)
-- ========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Policy: Service role can do everything (for backend)
CREATE POLICY "Service role has full access" ON public.profiles
  FOR ALL USING (auth.role() = 'service_role');

-- (Tùy chọn) Thêm policy cho admin/manager/superadmin
CREATE POLICY "Admins managers superadmins full access"
ON public.profiles
FOR ALL
TO authenticated
USING (
  (auth.jwt() ->> 'role') IN ('admin', 'manager', 'superadmin')
)
WITH CHECK (
  (auth.jwt() ->> 'role') IN ('admin', 'manager', 'superadmin')
);

-- ========================================
-- 4. FUNCTION TỰ ĐỘNG CẬP NHẬT updated_at
-- ========================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger cho profiles
CREATE TRIGGER on_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- 5. GRANT PERMISSIONS
-- ========================================
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;


-- ========================================
-- ============================================
-- HAIRSTYLES SERVICE - SUPABASE SCHEMA
-- ============================================

-- 1. Bảng Stylists (Thợ cắt tóc)
CREATE TABLE IF NOT EXISTS stylists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  experience INTEGER NOT NULL DEFAULT 0 CHECK (experience >= 0),
  rating DECIMAL(3,2) DEFAULT 0.00 CHECK (rating >= 0 AND rating <= 5),
  total_bookings INTEGER DEFAULT 0 CHECK (total_bookings >= 0),
  specialties TEXT[] NOT NULL DEFAULT '{}',
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_stylist_user UNIQUE(user_id)
);

-- 2. Bảng Hairstyles (Kiểu tóc)
CREATE TABLE IF NOT EXISTS hairstyles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  duration INTEGER NOT NULL CHECK (duration >= 15), -- phút
  image_url TEXT NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (
    category IN (
      'men_short', 'men_medium', 'men_long',
      'women_short', 'women_medium', 'women_long',
      'kids', 'beard', 'coloring', 'perm'
    )
  ),
  difficulty VARCHAR(20) NOT NULL CHECK (
    difficulty IN ('easy', 'medium', 'hard')
  ),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Bảng liên kết Hairstyle <-> Stylist (Many-to-Many)
CREATE TABLE IF NOT EXISTS hairstyle_stylists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hairstyle_id UUID NOT NULL REFERENCES hairstyles(id) ON DELETE CASCADE,
  stylist_id UUID NOT NULL REFERENCES stylists(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_hairstyle_stylist UNIQUE(hairstyle_id, stylist_id)
);

-- ============================================
-- INDEXES
-- ============================================

-- Stylists indexes
CREATE INDEX idx_stylists_user_id ON stylists(user_id);
CREATE INDEX idx_stylists_is_available ON stylists(is_available);
CREATE INDEX idx_stylists_rating ON stylists(rating DESC);

-- Hairstyles indexes
CREATE INDEX idx_hairstyles_category ON hairstyles(category);
CREATE INDEX idx_hairstyles_is_active ON hairstyles(is_active);
CREATE INDEX idx_hairstyles_price ON hairstyles(price);
CREATE INDEX idx_hairstyles_difficulty ON hairstyles(difficulty);
CREATE INDEX idx_hairstyles_created_at ON hairstyles(created_at DESC);

-- Hairstyle Stylists indexes
CREATE INDEX idx_hairstyle_stylists_hairstyle ON hairstyle_stylists(hairstyle_id);
CREATE INDEX idx_hairstyle_stylists_stylist ON hairstyle_stylists(stylist_id);

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger tự động cập nhật updated_at cho stylists
CREATE OR REPLACE FUNCTION update_stylists_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_stylists_updated_at
  BEFORE UPDATE ON stylists
  FOR EACH ROW
  EXECUTE FUNCTION update_stylists_updated_at();

-- Trigger tự động cập nhật updated_at cho hairstyles
CREATE OR REPLACE FUNCTION update_hairstyles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_hairstyles_updated_at
  BEFORE UPDATE ON hairstyles
  FOR EACH ROW
  EXECUTE FUNCTION update_hairstyles_updated_at();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS
ALTER TABLE stylists ENABLE ROW LEVEL SECURITY;
ALTER TABLE hairstyles ENABLE ROW LEVEL SECURITY;
ALTER TABLE hairstyle_stylists ENABLE ROW LEVEL SECURITY;

-- Policies cho Stylists
CREATE POLICY "Stylists are viewable by everyone"
  ON stylists FOR SELECT
  USING (true);

CREATE POLICY "Stylists can update own profile"
  ON stylists FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can insert stylists"
  ON stylists FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can delete stylists"
  ON stylists FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'superadmin')
    )
  );

-- Policies cho Hairstyles
CREATE POLICY "Hairstyles are viewable by everyone"
  ON hairstyles FOR SELECT
  USING (true);

CREATE POLICY "Managers can manage hairstyles"
  ON hairstyles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'manager', 'superadmin')
    )
  );

-- Policies cho Hairstyle_Stylists
CREATE POLICY "Hairstyle-Stylist links are viewable by everyone"
  ON hairstyle_stylists FOR SELECT
  USING (true);

CREATE POLICY "Managers can manage hairstyle-stylist links"
  ON hairstyle_stylists FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'manager', 'superadmin')
    )
  );

  -- ============================================
-- FIX RLS POLICIES - Allow Service Role Access
-- ============================================

-- BƯỚC 1: Drop tất cả policies cũ
DROP POLICY IF EXISTS "Stylists are viewable by everyone" ON stylists;
DROP POLICY IF EXISTS "Stylists can update own profile" ON stylists;
DROP POLICY IF EXISTS "Admins can insert stylists" ON stylists;
DROP POLICY IF EXISTS "Admins can delete stylists" ON stylists;
DROP POLICY IF EXISTS "Hairstyles are viewable by everyone" ON hairstyles;
DROP POLICY IF EXISTS "Managers can manage hairstyles" ON hairstyles;
DROP POLICY IF EXISTS "Hairstyle-Stylist links are viewable by everyone" ON hairstyle_stylists;
DROP POLICY IF EXISTS "Managers can manage hairstyle-stylist links" ON hairstyle_stylists;

-- BƯỚC 2: Tạo policies mới cho Service Role

-- ============================================
-- STYLISTS TABLE POLICIES
-- ============================================

-- Allow service_role full access (for backend API)
CREATE POLICY "Service role has full access to stylists"
  ON stylists
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Public can view all stylists
CREATE POLICY "Anyone can view stylists"
  ON stylists
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Authenticated users can view stylists
CREATE POLICY "Authenticated users can view stylists"
  ON stylists
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- HAIRSTYLES TABLE POLICIES
-- ============================================

-- Allow service_role full access (for backend API)
CREATE POLICY "Service role has full access to hairstyles"
  ON hairstyles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Public can view active hairstyles
CREATE POLICY "Anyone can view active hairstyles"
  ON hairstyles
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Allow viewing all hairstyles for authenticated users
CREATE POLICY "Authenticated can view all hairstyles"
  ON hairstyles
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- HAIRSTYLE_STYLISTS TABLE POLICIES
-- ============================================

-- Allow service_role full access
CREATE POLICY "Service role has full access to hairstyle_stylists"
  ON hairstyle_stylists
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Public can view links
CREATE POLICY "Anyone can view hairstyle-stylist links"
  ON hairstyle_stylists
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============================================
-- SEED DATA (Dữ liệu mẫu)
-- ============================================

-- Chèn dữ liệu mẫu stylists (thay user_id bằng UUID thực tế)
-- INSERT INTO stylists (user_id, full_name, experience, specialties) VALUES
-- ('user-uuid-1', 'Nguyễn Văn An', 5, ARRAY['Cắt tóc nam', 'Uốn tóc', 'Nhuộm tóc']),
-- ('user-uuid-2', 'Trần Thị Bình', 8, ARRAY['Cắt tóc nữ', 'Tạo kiểu', 'Duỗi tóc']),
-- ('user-uuid-3', 'Lê Minh Cường', 3, ARRAY['Cắt tóc nam', 'Cắt râu', 'Tỉa râu']);

-- Chèn dữ liệu mẫu hairstyles
INSERT INTO hairstyles (name, description, price, duration, image_url, category, difficulty) VALUES
('Undercut Classic', 'Kiểu tóc Undercut cổ điển, phù hợp với phong cách lịch lãm', 150000, 45, 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c', 'men_short', 'medium'),
('Mohawk Fade', 'Kiểu tóc Mohawk với fade hiện đại, cá tính mạnh mẽ', 200000, 60, 'https://images.unsplash.com/photo-1605497788044-5a32c7078486', 'men_short', 'hard'),
('Bob Ngắn', 'Kiểu tóc bob ngắn trẻ trung, năng động', 250000, 60, 'https://images.unsplash.com/photo-1560869713-7d0a29430803', 'women_short', 'medium'),
('Layer Dài', 'Kiểu tóc layer dài tự nhiên, phù hợp mọi khuôn mặt', 300000, 75, 'https://images.unsplash.com/photo-1595475884562-073c30d45670', 'women_long', 'easy'),
('Crew Cut', 'Kiểu tóc quân đội đơn giản, gọn gàng', 100000, 30, 'https://images.unsplash.com/photo-1621605815971-fbc98d665033', 'men_short', 'easy'),
('Uốn Xoăn Bồng Bềnh', 'Uốn tóc xoăn nhẹ, tạo độ phồng tự nhiên', 500000, 120, 'https://images.unsplash.com/photo-1580618672591-eb180b1a973f', 'women_long', 'hard'),
('Cắt Tóc Trẻ Em', 'Cắt tóc cho bé, nhiều kiểu dáng đáng yêu', 80000, 30, 'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9', 'kids', 'easy'),
('Tạo Kiểu Râu Hiện Đại', 'Tạo hình râu theo phong cách hiện đại, chỉnh sửa cẩn thận', 120000, 40, 'https://images.unsplash.com/photo-1621607512214-68297480165e', 'beard', 'medium'),
('Nhuộm Highlight', 'Nhuộm highlights tạo điểm nhấn cho mái tóc', 400000, 90, 'https://images.unsplash.com/photo-1562322140-8baeececf3df', 'coloring', 'medium'),
('Duỗi Phồng Tự Nhiên', 'Duỗi tóc tự nhiên, giữ độ phồng mềm mại', 600000, 150, 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e', 'perm', 'hard');

-- ============================================
-- VIEWS (Optional - để query dễ hơn)
-- ============================================

-- View để lấy danh sách hairstyles kèm stylists
CREATE OR REPLACE VIEW hairstyles_with_stylists AS
SELECT 
  h.*,
  COALESCE(
    json_agg(
      json_build_object(
        'id', s.id,
        'fullName', s.full_name,
        'avatarUrl', s.avatar_url,
        'experience', s.experience,
        'rating', s.rating
      )
    ) FILTER (WHERE s.id IS NOT NULL),
    '[]'::json
  ) as stylists
FROM hairstyles h
LEFT JOIN hairstyle_stylists hs ON h.id = hs.hairstyle_id
LEFT JOIN stylists s ON hs.stylist_id = s.id
GROUP BY h.id;

-- View để lấy thông tin stylist kèm hairstyles
CREATE OR REPLACE VIEW stylists_with_hairstyles AS
SELECT 
  s.*,
  COALESCE(
    json_agg(
      json_build_object(
        'id', h.id,
        'name', h.name,
        'price', h.price,
        'duration', h.duration,
        'category', h.category
      )
    ) FILTER (WHERE h.id IS NOT NULL),
    '[]'::json
  ) as hairstyles
FROM stylists s
LEFT JOIN hairstyle_stylists hs ON s.id = hs.stylist_id
LEFT JOIN hairstyles h ON hs.hairstyle_id = h.id AND h.is_active = true
GROUP BY s.id;

-- ============================================
-- MIGRATION: Add Hair Categories Table
-- ============================================
-- Purpose: Tách category từ enum sang bảng riêng để quản lý linh hoạt hơn
-- Date: January 2026

-- ============================================
-- 1. CREATE HAIR_CATEGORIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS hair_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  icon TEXT, -- URL to icon image
  image_url TEXT, -- Banner image for category page
  display_order INTEGER DEFAULT 0, -- Thứ tự hiển thị
  is_active BOOLEAN DEFAULT true,
  meta_title VARCHAR(200), -- SEO
  meta_description TEXT, -- SEO
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 2. CREATE INDEXES
-- ============================================
CREATE INDEX idx_hair_categories_slug ON hair_categories(slug);
CREATE INDEX idx_hair_categories_is_active ON hair_categories(is_active);
CREATE INDEX idx_hair_categories_display_order ON hair_categories(display_order);

-- ============================================
-- 3. SEED DEFAULT CATEGORIES
-- ============================================
-- Chèn các categories mặc định từ enum cũ
INSERT INTO hair_categories (name, slug, description, display_order, is_active) VALUES
('Nam - Tóc Ngắn', 'men-short', 'Các kiểu tóc ngắn phù hợp với nam giới', 1, true),
('Nam - Tóc Trung Bình', 'men-medium', 'Các kiểu tóc trung bình cho nam', 2, true),
('Nam - Tóc Dài', 'men-long', 'Các kiểu tóc dài cho nam', 3, true),
('Nữ - Tóc Ngắn', 'women-short', 'Các kiểu tóc ngắn cho nữ giới', 4, true),
('Nữ - Tóc Trung Bình', 'women-medium', 'Các kiểu tóc trung bình cho nữ', 5, true),
('Nữ - Tóc Dài', 'women-long', 'Các kiểu tóc dài cho nữ giới', 6, true),
('Trẻ Em', 'kids', 'Các kiểu tóc dành cho trẻ em', 7, true),
('Râu', 'beard', 'Các kiểu tạo râu và chăm sóc râu', 8, true),
('Nhuộm Màu', 'coloring', 'Các dịch vụ nhuộm và highlight', 9, true),
('Uốn/Duỗi', 'perm', 'Các dịch vụ uốn và duỗi tóc', 10, true)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- 4. ADD CATEGORY_ID TO HAIRSTYLES TABLE
-- ============================================
-- Thêm cột mới (nullable trước)
ALTER TABLE hairstyles ADD COLUMN IF NOT EXISTS category_id UUID;

-- Tạo foreign key
ALTER TABLE hairstyles 
ADD CONSTRAINT fk_hairstyles_category 
FOREIGN KEY (category_id) 
REFERENCES hair_categories(id) 
ON DELETE SET NULL;

-- Create index
CREATE INDEX idx_hairstyles_category_id ON hairstyles(category_id);

-- ============================================
-- 5. MIGRATE DATA - Map old enum to new table
-- ============================================
-- Update existing hairstyles to use new category_id
UPDATE hairstyles 
SET category_id = (
  SELECT id FROM hair_categories WHERE slug = 'men-short'
)
WHERE category = 'men_short';

UPDATE hairstyles 
SET category_id = (
  SELECT id FROM hair_categories WHERE slug = 'men-medium'
)
WHERE category = 'men_medium';

UPDATE hairstyles 
SET category_id = (
  SELECT id FROM hair_categories WHERE slug = 'men-long'
)
WHERE category = 'men_long';

UPDATE hairstyles 
SET category_id = (
  SELECT id FROM hair_categories WHERE slug = 'women-short'
)
WHERE category = 'women_short';

UPDATE hairstyles 
SET category_id = (
  SELECT id FROM hair_categories WHERE slug = 'women-medium'
)
WHERE category = 'men_medium';

UPDATE hairstyles 
SET category_id = (
  SELECT id FROM hair_categories WHERE slug = 'women-long'
)
WHERE category = 'women_long';

UPDATE hairstyles 
SET category_id = (
  SELECT id FROM hair_categories WHERE slug = 'kids'
)
WHERE category = 'kids';

UPDATE hairstyles 
SET category_id = (
  SELECT id FROM hair_categories WHERE slug = 'beard'
)
WHERE category = 'beard';

UPDATE hairstyles 
SET category_id = (
  SELECT id FROM hair_categories WHERE slug = 'coloring'
)
WHERE category = 'coloring';

UPDATE hairstyles 
SET category_id = (
  SELECT id FROM hair_categories WHERE slug = 'perm'
)
WHERE category = 'perm';

-- ============================================
-- 6. MAKE CATEGORY_ID NOT NULL (after data migration)
-- ============================================
-- Sau khi migrate data xong, set NOT NULL
ALTER TABLE hairstyles ALTER COLUMN category_id SET NOT NULL;

-- ============================================
-- 7. DROP OLD CATEGORY COLUMN (OPTIONAL - Keep for backward compatibility)
-- ============================================
-- Option 1: Giữ lại cột cũ để backward compatibility (RECOMMENDED)
-- DO NOTHING

-- Option 2: Xóa cột cũ (uncomment nếu muốn)
-- ALTER TABLE hairstyles DROP COLUMN IF EXISTS category;

-- ============================================
-- 8. TRIGGERS
-- ============================================
-- Trigger tự động cập nhật updated_at
CREATE OR REPLACE FUNCTION update_hair_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_hair_categories_updated_at
  BEFORE UPDATE ON hair_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_hair_categories_updated_at();

-- ============================================
-- 9. ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE hair_categories ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access
CREATE POLICY "Service role has full access to hair_categories"
  ON hair_categories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Public can view active categories
CREATE POLICY "Anyone can view active categories"
  ON hair_categories
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Authenticated can view all categories
CREATE POLICY "Authenticated can view all categories"
  ON hair_categories
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- 10. VIEWS - Enhanced hairstyles_with_categories
-- ============================================
-- Drop old view if exists
DROP VIEW IF EXISTS hairstyles_with_stylists;

-- Create new view with category info
CREATE OR REPLACE VIEW hairstyles_with_details AS
SELECT 
  h.*,
  json_build_object(
    'id', c.id,
    'name', c.name,
    'slug', c.slug,
    'icon', c.icon
  ) as category_info,
  COALESCE(
    json_agg(
      json_build_object(
        'id', s.id,
        'fullName', s.full_name,
        'avatarUrl', s.avatar_url,
        'experience', s.experience,
        'rating', s.rating
      )
    ) FILTER (WHERE s.id IS NOT NULL),
    '[]'::json
  ) as stylists
FROM hairstyles h
LEFT JOIN hair_categories c ON h.category_id = c.id
LEFT JOIN hairstyle_stylists hs ON h.id = hs.hairstyle_id
LEFT JOIN stylists s ON hs.stylist_id = s.id
GROUP BY h.id, c.id, c.name, c.slug, c.icon;

-- ============================================
-- 11. VERIFICATION QUERIES
-- ============================================
-- Verify migration
-- SELECT COUNT(*) as total_categories FROM hair_categories;
-- SELECT COUNT(*) as hairstyles_with_category FROM hairstyles WHERE category_id IS NOT NULL;
-- SELECT c.name, COUNT(h.id) as hairstyle_count 
-- FROM hair_categories c 
-- LEFT JOIN hairstyles h ON c.id = h.category_id 
-- GROUP BY c.id, c.name 
-- ORDER BY c.display_order;

-- ============================================
-- ROLLBACK (if needed)
-- ============================================
-- DROP VIEW IF EXISTS hairstyles_with_details;
-- ALTER TABLE hairstyles DROP CONSTRAINT IF EXISTS fk_hairstyles_category;
-- ALTER TABLE hairstyles DROP COLUMN IF EXISTS category_id;
-- DROP TABLE IF EXISTS hair_categories CASCADE;

-- ============================================
-- BOOKING SERVICE - SUPABASE SCHEMA
-- ============================================

-- 1. Bảng Appointments (Lịch hẹn)
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stylist_id UUID NOT NULL REFERENCES stylists(id) ON DELETE RESTRICT,
  hairstyle_id UUID NOT NULL REFERENCES hairstyles(id) ON DELETE RESTRICT,
  
  -- Thông tin đặt lịch
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  duration INTEGER NOT NULL CHECK (duration >= 15), -- phút
  
  -- Trạng thái
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending',      -- Chờ xác nhận
      'confirmed',    -- Đã xác nhận
      'in_progress',  -- Đang thực hiện
      'completed',    -- Hoàn thành
      'cancelled',    -- Đã hủy
      'no_show'       -- Khách không đến
    )
  ),
  
  -- Thông tin khách hàng
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  customer_email VARCHAR(255),
  
  -- Ghi chú
  notes TEXT,
  cancellation_reason TEXT,
  
  -- Giá tiền
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  deposit_amount DECIMAL(10,2) DEFAULT 0 CHECK (deposit_amount >= 0),
  deposit_paid BOOLEAN DEFAULT false,
  
  -- Reminder
  reminder_sent BOOLEAN DEFAULT false,
  reminder_sent_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  confirmed_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Constraints
  CONSTRAINT valid_time_range CHECK (end_time > start_time),
  CONSTRAINT valid_deposit CHECK (deposit_amount <= price)
);

-- 2. Bảng Stylist Schedule (Lịch làm việc của thợ)
CREATE TABLE IF NOT EXISTS stylist_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stylist_id UUID NOT NULL REFERENCES stylists(id) ON DELETE CASCADE,
  
  -- Ngày làm việc
  work_date DATE NOT NULL,
  
  -- Giờ làm việc
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  
  -- Trạng thái
  is_available BOOLEAN DEFAULT true,
  is_day_off BOOLEAN DEFAULT false,
  
  -- Ghi chú
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint: Mỗi stylist chỉ có 1 schedule cho 1 ngày
  CONSTRAINT unique_stylist_date UNIQUE(stylist_id, work_date),
  CONSTRAINT valid_work_time CHECK (end_time > start_time)
);

-- 3. Bảng Break Times (Giờ nghỉ trong ngày)
CREATE TABLE IF NOT EXISTS stylist_break_times (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES stylist_schedules(id) ON DELETE CASCADE,
  
  break_start TIME NOT NULL,
  break_end TIME NOT NULL,
  reason VARCHAR(100),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_break_time CHECK (break_end > break_start)
);

-- 4. Bảng Queue Management (Quản lý hàng đợi)
CREATE TABLE IF NOT EXISTS appointment_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  
  -- Vị trí trong queue
  queue_position INTEGER NOT NULL CHECK (queue_position > 0),
  
  -- Thời gian ước tính
  estimated_start_time TIMESTAMP WITH TIME ZONE,
  estimated_wait_minutes INTEGER DEFAULT 0,
  
  -- Trạng thái
  status VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK (
    status IN ('waiting', 'called', 'serving', 'completed', 'cancelled')
  ),
  
  -- Thông báo
  notified BOOLEAN DEFAULT false,
  notified_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_appointment_queue UNIQUE(appointment_id)
);

-- 5. Bảng Recurring Appointments (Lịch hẹn định kỳ)
CREATE TABLE IF NOT EXISTS recurring_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stylist_id UUID NOT NULL REFERENCES stylists(id) ON DELETE RESTRICT,
  hairstyle_id UUID NOT NULL REFERENCES hairstyles(id) ON DELETE RESTRICT,
  
  -- Cấu hình lặp lại
  recurrence_type VARCHAR(20) NOT NULL CHECK (
    recurrence_type IN ('daily', 'weekly', 'biweekly', 'monthly')
  ),
  
  -- Ngày bắt đầu và kết thúc
  start_date DATE NOT NULL,
  end_date DATE,
  
  -- Giờ cố định
  preferred_time TIME NOT NULL,
  duration INTEGER NOT NULL,
  
  -- Trạng thái
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Bảng Appointment History (Lịch sử thay đổi)
CREATE TABLE IF NOT EXISTS appointment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  
  -- Thông tin thay đổi
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL, -- created, updated, cancelled, confirmed, etc.
  
  -- Dữ liệu trước và sau
  old_data JSONB,
  new_data JSONB,
  
  -- Ghi chú
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Bảng Blackout Dates (Ngày nghỉ lễ, đóng cửa)
CREATE TABLE IF NOT EXISTS blackout_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ngày nghỉ
  blackout_date DATE NOT NULL,
  
  -- Thông tin
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Áp dụng cho ai
  applies_to_all BOOLEAN DEFAULT true,
  stylist_id UUID REFERENCES stylists(id) ON DELETE CASCADE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_blackout_date UNIQUE(blackout_date, stylist_id)
);

-- ============================================
-- INDEXES
-- ============================================

-- Appointments indexes
CREATE INDEX idx_appointments_customer ON appointments(customer_id);
CREATE INDEX idx_appointments_stylist ON appointments(stylist_id);
CREATE INDEX idx_appointments_hairstyle ON appointments(hairstyle_id);
CREATE INDEX idx_appointments_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_datetime ON appointments(appointment_date, start_time);

-- Stylist Schedules indexes
CREATE INDEX idx_stylist_schedules_stylist ON stylist_schedules(stylist_id);
CREATE INDEX idx_stylist_schedules_date ON stylist_schedules(work_date);
CREATE INDEX idx_stylist_schedules_available ON stylist_schedules(is_available);

-- Queue indexes
CREATE INDEX idx_queue_appointment ON appointment_queue(appointment_id);
CREATE INDEX idx_queue_position ON appointment_queue(queue_position);
CREATE INDEX idx_queue_status ON appointment_queue(status);

-- Recurring Appointments indexes
CREATE INDEX idx_recurring_customer ON recurring_appointments(customer_id);
CREATE INDEX idx_recurring_stylist ON recurring_appointments(stylist_id);
CREATE INDEX idx_recurring_active ON recurring_appointments(is_active);

-- History indexes
CREATE INDEX idx_history_appointment ON appointment_history(appointment_id);
CREATE INDEX idx_history_created ON appointment_history(created_at DESC);

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger tự động cập nhật updated_at cho appointments
CREATE OR REPLACE FUNCTION update_appointments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION update_appointments_updated_at();

-- Trigger tự động cập nhật updated_at cho stylist_schedules
CREATE OR REPLACE FUNCTION update_stylist_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_stylist_schedules_updated_at
  BEFORE UPDATE ON stylist_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_stylist_schedules_updated_at();

-- Trigger ghi log khi appointment thay đổi
CREATE OR REPLACE FUNCTION log_appointment_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO appointment_history (appointment_id, action, new_data)
    VALUES (NEW.id, 'created', row_to_json(NEW)::jsonb);
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO appointment_history (appointment_id, action, old_data, new_data)
    VALUES (NEW.id, 'updated', row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO appointment_history (appointment_id, action, old_data)
    VALUES (OLD.id, 'deleted', row_to_json(OLD)::jsonb);
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_appointment_changes
  AFTER INSERT OR UPDATE OR DELETE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION log_appointment_changes();

-- Trigger cập nhật total_bookings cho stylist khi appointment completed
CREATE OR REPLACE FUNCTION update_stylist_bookings_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    UPDATE stylists 
    SET total_bookings = total_bookings + 1
    WHERE id = NEW.stylist_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_stylist_bookings
  AFTER INSERT OR UPDATE ON appointments
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION update_stylist_bookings_count();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stylist_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE stylist_break_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE blackout_dates ENABLE ROW LEVEL SECURITY;

-- Service role policies (Backend full access)
CREATE POLICY "Service role full access appointments"
  ON appointments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access schedules"
  ON stylist_schedules FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access break_times"
  ON stylist_break_times FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access queue"
  ON appointment_queue FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access recurring"
  ON recurring_appointments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access history"
  ON appointment_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access blackout"
  ON blackout_dates FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated users policies
CREATE POLICY "Users can view own appointments"
  ON appointments FOR SELECT TO authenticated
  USING (auth.uid() = customer_id);

CREATE POLICY "Users can view available schedules"
  ON stylist_schedules FOR SELECT TO authenticated
  USING (is_available = true);

CREATE POLICY "Users can view blackout dates"
  ON blackout_dates FOR SELECT TO authenticated
  USING (true);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function để check xem stylist có available không tại thời điểm cụ thể
CREATE OR REPLACE FUNCTION is_stylist_available(
  p_stylist_id UUID,
  p_date DATE,
  p_start_time TIME,
  p_end_time TIME,
  p_exclude_appointment_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_schedule_exists BOOLEAN;
  v_has_conflict BOOLEAN;
  v_is_blackout BOOLEAN;
BEGIN
  -- Check if stylist has schedule for this date
  SELECT EXISTS(
    SELECT 1 FROM stylist_schedules
    WHERE stylist_id = p_stylist_id
      AND work_date = p_date
      AND is_available = true
      AND is_day_off = false
      AND p_start_time >= start_time
      AND p_end_time <= end_time
  ) INTO v_schedule_exists;
  
  IF NOT v_schedule_exists THEN
    RETURN false;
  END IF;
  
  -- Check for blackout dates
  SELECT EXISTS(
    SELECT 1 FROM blackout_dates
    WHERE blackout_date = p_date
      AND (applies_to_all = true OR stylist_id = p_stylist_id)
  ) INTO v_is_blackout;
  
  IF v_is_blackout THEN
    RETURN false;
  END IF;
  
  -- Check for conflicting appointments
  SELECT EXISTS(
    SELECT 1 FROM appointments
    WHERE stylist_id = p_stylist_id
      AND appointment_date = p_date
      AND status NOT IN ('cancelled', 'no_show')
      AND (id != p_exclude_appointment_id OR p_exclude_appointment_id IS NULL)
      AND (
        (p_start_time >= start_time AND p_start_time < end_time)
        OR (p_end_time > start_time AND p_end_time <= end_time)
        OR (p_start_time <= start_time AND p_end_time >= end_time)
      )
  ) INTO v_has_conflict;
  
  RETURN NOT v_has_conflict;
END;
$$ LANGUAGE plpgsql;

-- Function để tính queue position
CREATE OR REPLACE FUNCTION calculate_queue_position(
  p_appointment_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_position INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO v_position
  FROM appointment_queue
  WHERE status = 'waiting'
    AND id != p_appointment_id
    AND created_at < (SELECT created_at FROM appointment_queue WHERE appointment_id = p_appointment_id);
  
  RETURN v_position;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEWS
-- ============================================

-- View để lấy appointments với đầy đủ thông tin
CREATE OR REPLACE VIEW appointments_detailed AS
SELECT 
  a.*,
  s.full_name as stylist_name,
  s.avatar_url as stylist_avatar,
  h.name as hairstyle_name,
  h.image_url as hairstyle_image,
  p.full_name as customer_full_name,
  p.email as customer_user_email,
  p.phone as customer_user_phone
FROM appointments a
LEFT JOIN stylists s ON a.stylist_id = s.id
LEFT JOIN hairstyles h ON a.hairstyle_id = h.id
LEFT JOIN profiles p ON a.customer_id = p.id;

-- View để lấy available time slots
CREATE OR REPLACE VIEW available_time_slots AS
SELECT 
  ss.stylist_id,
  ss.work_date,
  ss.start_time,
  ss.end_time,
  s.full_name as stylist_name,
  COUNT(a.id) as booking_count
FROM stylist_schedules ss
JOIN stylists s ON ss.stylist_id = s.id
LEFT JOIN appointments a ON 
  a.stylist_id = ss.stylist_id 
  AND a.appointment_date = ss.work_date
  AND a.status NOT IN ('cancelled', 'no_show')
WHERE ss.is_available = true
  AND ss.is_day_off = false
  AND ss.work_date >= CURRENT_DATE
GROUP BY ss.id, ss.stylist_id, ss.work_date, ss.start_time, ss.end_time, s.full_name;


-- ============================================
-- BRANCHES MANAGEMENT - SUPABASE SCHEMA
-- ============================================
-- Purpose: Quản lý chi nhánh salon
-- Date: February 2026

-- ============================================
-- 1. CREATE BRANCHES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  code VARCHAR(50) NOT NULL UNIQUE, -- Mã chi nhánh (VD: HN01, HCM01)
  
  -- Thông tin liên hệ
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  
  -- Địa chỉ
  address TEXT NOT NULL,
  ward VARCHAR(100), -- Phường/Xã
  district VARCHAR(100), -- Quận/Huyện
  city VARCHAR(100) NOT NULL, -- Thành phố
  country VARCHAR(100) DEFAULT 'Vietnam',
  postal_code VARCHAR(20),
  
  -- Tọa độ (để tìm chi nhánh gần nhất)
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  -- Thông tin hoạt động
  is_active BOOLEAN DEFAULT true,
  is_primary BOOLEAN DEFAULT false, -- Chi nhánh chính
  opening_date DATE,
  
  -- Giờ làm việc (JSON format)
  -- VD: {"monday": {"open": "08:00", "close": "20:00"}, ...}
  working_hours JSONB DEFAULT '{}'::jsonb,
  
  -- Ảnh và mô tả
  image_url TEXT,
  description TEXT,
  amenities TEXT[], -- Tiện ích: ["wifi", "parking", "air_conditioner"]
  
  -- Thống kê
  total_stylists INTEGER DEFAULT 0,
  total_bookings INTEGER DEFAULT 0,
  average_rating DECIMAL(3,2) DEFAULT 0.00,
  
  -- SEO
  meta_title VARCHAR(200),
  meta_description TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 2. CREATE BRANCH_STAFF TABLE (Many-to-Many)
-- ============================================
-- Liên kết nhân viên với chi nhánh
CREATE TABLE IF NOT EXISTS branch_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Role trong chi nhánh này
  role VARCHAR(50) NOT NULL CHECK (
    role IN ('manager', 'stylist', 'staff')
  ),
  
  -- Trạng thái
  is_active BOOLEAN DEFAULT true,
  is_primary_branch BOOLEAN DEFAULT true, -- Chi nhánh chính của nhân viên
  
  -- Thời gian
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  left_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint: Một user chỉ có một role tại một chi nhánh
  CONSTRAINT unique_branch_staff UNIQUE(branch_id, user_id)
);

-- ============================================
-- 3. CREATE BRANCH_ADMINS TABLE
-- ============================================
-- Quản lý quyền admin cho từng chi nhánh
CREATE TABLE IF NOT EXISTS branch_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Quyền hạn
  can_manage_staff BOOLEAN DEFAULT true,
  can_view_reports BOOLEAN DEFAULT true,
  can_manage_bookings BOOLEAN DEFAULT true,
  can_manage_services BOOLEAN DEFAULT false,
  
  -- Thời gian
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint: Một user chỉ là admin của một chi nhánh một lần
  CONSTRAINT unique_branch_admin UNIQUE(branch_id, user_id)
);

-- ============================================
-- 4. CREATE INDEXES
-- ============================================

-- Branches indexes
CREATE INDEX idx_branches_slug ON branches(slug);
CREATE INDEX idx_branches_code ON branches(code);
CREATE INDEX idx_branches_city ON branches(city);
CREATE INDEX idx_branches_is_active ON branches(is_active);
CREATE INDEX idx_branches_location ON branches(latitude, longitude);

-- Branch Staff indexes
CREATE INDEX idx_branch_staff_branch ON branch_staff(branch_id);
CREATE INDEX idx_branch_staff_user ON branch_staff(user_id);
CREATE INDEX idx_branch_staff_role ON branch_staff(role);
CREATE INDEX idx_branch_staff_is_active ON branch_staff(is_active);

-- Branch Admins indexes
CREATE INDEX idx_branch_admins_branch ON branch_admins(branch_id);
CREATE INDEX idx_branch_admins_user ON branch_admins(user_id);

-- ============================================
-- 5. TRIGGERS
-- ============================================

-- Trigger cập nhật updated_at cho branches
CREATE OR REPLACE FUNCTION update_branches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_branches_updated_at
  BEFORE UPDATE ON branches
  FOR EACH ROW
  EXECUTE FUNCTION update_branches_updated_at();

-- Trigger cập nhật updated_at cho branch_staff
CREATE OR REPLACE FUNCTION update_branch_staff_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_branch_staff_updated_at
  BEFORE UPDATE ON branch_staff
  FOR EACH ROW
  EXECUTE FUNCTION update_branch_staff_updated_at();

-- Trigger cập nhật updated_at cho branch_admins
CREATE OR REPLACE FUNCTION update_branch_admins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_branch_admins_updated_at
  BEFORE UPDATE ON branch_admins
  FOR EACH ROW
  EXECUTE FUNCTION update_branch_admins_updated_at();

-- Trigger cập nhật total_stylists khi thêm/xóa stylist
CREATE OR REPLACE FUNCTION update_branch_stylist_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'stylist' AND NEW.is_active = true THEN
      UPDATE branches 
      SET total_stylists = total_stylists + 1
      WHERE id = NEW.branch_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'stylist' AND OLD.is_active = true 
       AND (NEW.role != 'stylist' OR NEW.is_active = false) THEN
      UPDATE branches 
      SET total_stylists = total_stylists - 1
      WHERE id = OLD.branch_id;
    ELSIF (OLD.role != 'stylist' OR OLD.is_active = false)
          AND NEW.role = 'stylist' AND NEW.is_active = true THEN
      UPDATE branches 
      SET total_stylists = total_stylists + 1
      WHERE id = NEW.branch_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.role = 'stylist' AND OLD.is_active = true THEN
      UPDATE branches 
      SET total_stylists = total_stylists - 1
      WHERE id = OLD.branch_id;
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_branch_stylist_count
  AFTER INSERT OR UPDATE OR DELETE ON branch_staff
  FOR EACH ROW
  EXECUTE FUNCTION update_branch_stylist_count();

-- ============================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_admins ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access branches"
  ON branches FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access branch_staff"
  ON branch_staff FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access branch_admins"
  ON branch_admins FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Public can view active branches
CREATE POLICY "Anyone can view active branches"
  ON branches FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Authenticated can view all branches
CREATE POLICY "Authenticated can view all branches"
  ON branches FOR SELECT
  TO authenticated
  USING (true);

-- Staff can view their branch assignments
CREATE POLICY "Staff can view their branch assignments"
  ON branch_staff FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Branch admins can view their assignments
CREATE POLICY "Admins can view their branch admin assignments"
  ON branch_admins FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================
-- 7. FUNCTIONS
-- ============================================

-- Function: Check if user is admin of a branch
CREATE OR REPLACE FUNCTION is_branch_admin(
  p_user_id UUID,
  p_branch_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  -- Check if user is SuperAdmin or Admin
  SELECT EXISTS(
    SELECT 1 FROM profiles
    WHERE id = p_user_id
      AND role IN ('admin', 'superadmin')
  ) INTO v_is_admin;
  
  IF v_is_admin THEN
    RETURN true;
  END IF;
  
  -- Check if user is branch admin
  SELECT EXISTS(
    SELECT 1 FROM branch_admins
    WHERE user_id = p_user_id
      AND branch_id = p_branch_id
  ) INTO v_is_admin;
  
  RETURN v_is_admin;
END;
$$ LANGUAGE plpgsql;

-- Function: Get user's branches
CREATE OR REPLACE FUNCTION get_user_branches(p_user_id UUID)
RETURNS TABLE(
  branch_id UUID,
  branch_name VARCHAR,
  role VARCHAR,
  is_admin BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bs.branch_id,
    b.name as branch_name,
    bs.role,
    EXISTS(
      SELECT 1 FROM branch_admins ba
      WHERE ba.user_id = p_user_id
        AND ba.branch_id = bs.branch_id
    ) as is_admin
  FROM branch_staff bs
  JOIN branches b ON bs.branch_id = b.id
  WHERE bs.user_id = p_user_id
    AND bs.is_active = true
    AND b.is_active = true
  ORDER BY bs.is_primary_branch DESC, b.name;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 8. VIEWS
-- ============================================

-- View: Branches with full details
CREATE OR REPLACE VIEW branches_with_details AS
SELECT 
  b.*,
  (
    SELECT COUNT(*) 
    FROM branch_staff bs 
    WHERE bs.branch_id = b.id 
      AND bs.is_active = true
  ) as total_staff,
  (
    SELECT COUNT(*) 
    FROM branch_staff bs 
    WHERE bs.branch_id = b.id 
      AND bs.role = 'stylist'
      AND bs.is_active = true
  ) as active_stylists,
  (
    SELECT COUNT(*) 
    FROM branch_staff bs 
    WHERE bs.branch_id = b.id 
      AND bs.role = 'manager'
      AND bs.is_active = true
  ) as managers,
  (
    SELECT json_agg(
      json_build_object(
        'id', p.id,
        'fullName', p.full_name,
        'email', p.email,
        'avatarUrl', p.avatar_url
      )
    )
    FROM branch_admins ba
    JOIN profiles p ON ba.user_id = p.id
    WHERE ba.branch_id = b.id
  ) as admins
FROM branches b;

-- View: Branch staff with details
CREATE OR REPLACE VIEW branch_staff_with_details AS
SELECT 
  bs.*,
  b.name as branch_name,
  b.city as branch_city,
  p.full_name,
  p.email,
  p.phone,
  p.avatar_url,
  p.role as user_role,
  EXISTS(
    SELECT 1 FROM branch_admins ba
    WHERE ba.user_id = bs.user_id
      AND ba.branch_id = bs.branch_id
  ) as is_branch_admin
FROM branch_staff bs
JOIN branches b ON bs.branch_id = b.id
JOIN profiles p ON bs.user_id = p.id;

-- ============================================
-- 9. SEED DATA (Example)
-- ============================================

-- Insert sample branches
INSERT INTO branches (name, slug, code, phone, address, city, latitude, longitude, is_primary) VALUES
('Chi nhánh Hà Nội - Hoàn Kiếm', 'ha-noi-hoan-kiem', 'HN01', '024-1234-5678', '123 Phố Huế, Hoàn Kiếm', 'Hà Nội', 21.0285, 105.8542, true),
('Chi nhánh Hà Nội - Cầu Giấy', 'ha-noi-cau-giay', 'HN02', '024-8765-4321', '456 Trần Duy Hưng, Cầu Giấy', 'Hà Nội', 21.0333, 105.7938, false),
('Chi nhánh TP.HCM - Quận 1', 'hcm-quan-1', 'HCM01', '028-1234-5678', '789 Nguyễn Huệ, Quận 1', 'TP. Hồ Chí Minh', 10.7756, 106.7019, false),
('Chi nhánh Đà Nẵng', 'da-nang', 'DN01', '0236-123-456', '321 Bạch Đằng, Hải Châu', 'Đà Nẵng', 16.0544, 108.2022, false)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- 10. GRANT PERMISSIONS
-- ============================================

GRANT ALL ON branches TO authenticated;
GRANT ALL ON branch_staff TO authenticated;
GRANT ALL ON branch_admins TO authenticated;

GRANT ALL ON branches TO service_role;
GRANT ALL ON branch_staff TO service_role;
GRANT ALL ON branch_admins TO service_role;


-- ============================================
-- SEPAY TRANSACTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS sepay_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id VARCHAR(255) UNIQUE,           -- ID giao dịch từ Sepay
  account_number VARCHAR(100),                   -- Số tài khoản
  transaction_date TIMESTAMP WITH TIME ZONE,     -- Thời gian giao dịch
  transfer_amount DECIMAL(18,2) DEFAULT 0,       -- Số tiền chuyển
  content TEXT,                                  -- Nội dung giao dịch (quan trọng nhất)
  reference_number VARCHAR(255),                 -- Mã tham chiếu
  raw_body JSONB,                                -- Raw payload từ Sepay
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Index để search nhanh theo content
  CONSTRAINT sepay_transactions_transaction_id_unique UNIQUE(transaction_id)
);

-- Indexes
CREATE INDEX idx_sepay_transactions_content ON sepay_transactions USING gin(to_tsvector('simple', content));
CREATE INDEX idx_sepay_transactions_content_like ON sepay_transactions(content);
CREATE INDEX idx_sepay_transactions_account ON sepay_transactions(account_number);
CREATE INDEX idx_sepay_transactions_date ON sepay_transactions(transaction_date DESC);
CREATE INDEX idx_sepay_transactions_reference ON sepay_transactions(reference_number);

-- RLS
ALTER TABLE sepay_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access sepay_transactions"
  ON sepay_transactions FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

CREATE OR REPLACE FUNCTION update_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_notifications_updated_at();

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access notifications"
  ON notifications FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can view notifications"
  ON notifications FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============================================
-- SERVICES MANAGEMENT - SUPABASE SCHEMA
-- ============================================
-- Purpose: Quản lý dịch vụ (services) của salon
-- Date: April 2026

-- ============================================
-- 1. CREATE SERVICES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Thông tin cơ bản
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  duration INTEGER NOT NULL CHECK (duration >= 15), -- phút

  -- Phân loại
  category VARCHAR(100),

  -- Ảnh
  image_url TEXT,

  -- Soft delete: chỉ cần đặt is_available = false để "xóa mềm"
  is_available BOOLEAN NOT NULL DEFAULT true,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 2. INDEXES
-- ============================================
CREATE INDEX idx_services_is_available ON services(is_available);
CREATE INDEX idx_services_category    ON services(category);
CREATE INDEX idx_services_price       ON services(price);
CREATE INDEX idx_services_created_at  ON services(created_at DESC);

-- ============================================
-- 3. TRIGGER auto updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_services_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_services_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW
  EXECUTE FUNCTION update_services_updated_at();

-- ============================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

-- Service role: full access (backend API)
CREATE POLICY "Service role full access services"
  ON services FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Public / authenticated: chỉ xem dịch vụ đang available
CREATE POLICY "Anyone can view available services"
  ON services FOR SELECT
  TO anon, authenticated
  USING (is_available = true);

-- ============================================
-- 5. GRANT PERMISSIONS
-- ============================================
GRANT ALL ON services TO service_role;
GRANT SELECT ON services TO anon;
GRANT SELECT ON services TO authenticated;

-- ============================================
-- 6. SEED DATA (tùy chọn)
-- ============================================
INSERT INTO services (name, description, price, duration, category, is_available) VALUES
('Cắt tóc cơ bản',   'Dịch vụ cắt tóc cơ bản cho mọi kiểu tóc',        80000,  30, 'Cắt tóc', true),
('Gội đầu + massage', 'Gội đầu kết hợp massage đầu thư giãn',            60000,  20, 'Chăm sóc', true),
('Nhuộm toàn đầu',   'Nhuộm tóc toàn bộ với màu tùy chọn',             350000,  90, 'Nhuộm',    true),
('Uốn tóc Hàn Quốc', 'Uốn tóc phong cách Hàn Quốc giữ nếp lâu',       500000, 120, 'Uốn/Duỗi', true),
('Duỗi tóc tự nhiên','Duỗi tóc giữ độ phồng và độ bóng tự nhiên',      450000, 100, 'Uốn/Duỗi', true)
ON CONFLICT DO NOTHING;