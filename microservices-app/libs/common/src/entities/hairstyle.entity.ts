export interface Hairstyle {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: number; // phút
  imageUrl: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  stylistIds: string[]; // Danh sách ID thợ cắt có thể thực hiện
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export enum HairstyleCategory {
  MEN_SHORT = 'men_short',
  MEN_MEDIUM = 'men_medium',
  MEN_LONG = 'men_long',
  WOMEN_SHORT = 'women_short',
  WOMEN_MEDIUM = 'women_medium',
  WOMEN_LONG = 'women_long',
  KIDS = 'kids',
  BEARD = 'beard',
  COLORING = 'coloring',
  PERM = 'perm',
}

export interface Stylist {
  id: string;
  userId: string;
  fullName: string;
  avatarUrl?: string;
  experience: number; // năm kinh nghiệm
  rating: number;
  totalBookings: number;
  specialties: string[]; // Chuyên môn
  isAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
}