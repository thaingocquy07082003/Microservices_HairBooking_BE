// libs/common/src/entities/service.entity.ts

export interface Service {
  id: string;
  name: string;
  description?: string;
  price: number;
  duration: number; // phút
  category?: string;
  imageUrl?: string;
  isAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceStats {
  total: number;
  available: number;
  unavailable: number;
}