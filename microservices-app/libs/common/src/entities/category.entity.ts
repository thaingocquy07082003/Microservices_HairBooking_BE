export interface HairCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  imageUrl?: string;
  displayOrder: number;
  isActive: boolean;
  metaTitle?: string;
  metaDescription?: string;
  hairstyleCount?: number; // Số lượng hairstyles trong category này
  createdAt: Date;
  updatedAt: Date;
}

export interface HairCategoryWithStats extends HairCategory {
  hairstyleCount: number;
  activeHairstyleCount: number;
}