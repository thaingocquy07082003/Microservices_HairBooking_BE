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