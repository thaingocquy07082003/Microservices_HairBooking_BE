// Branch Entity
export interface Branch {
  id: string;
  name: string;
  slug: string;
  code: string;
  
  // Contact info
  phone: string;
  email?: string;
  
  // Address
  address: string;
  ward?: string;
  district?: string;
  city: string;
  country: string;
  postalCode?: string;
  
  // Location
  latitude?: number;
  longitude?: number;
  
  // Status
  isActive: boolean;
  isPrimary: boolean;
  openingDate?: Date;
  
  // Working hours
  workingHours: WorkingHours;
  
  // Images and description
  imageUrl?: string;
  description?: string;
  amenities: string[];
  
  // Stats
  totalStylists: number;
  totalBookings: number;
  averageRating: number;
  
  // SEO
  metaTitle?: string;
  metaDescription?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

// Branch with detailed stats
export interface BranchWithDetails extends Branch {
  totalStaff: number;
  activeStylists: number;
  managers: number;
  admins?: BranchAdmin[];
}

// Working hours structure
export interface WorkingHours {
  [key: string]: {
    open: string;
    close: string;
    isClosed?: boolean;
  };
}

// Branch Staff
export interface BranchStaff {
  id: string;
  branchId: string;
  userId: string;
  role: 'manager' | 'stylist' | 'staff';
  isActive: boolean;
  isPrimaryBranch: boolean;
  joinedAt: Date;
  leftAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Branch Staff with details
export interface BranchStaffWithDetails extends BranchStaff {
  branchName: string;
  branchCity: string;
  fullName: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  userRole: string;
  isBranchAdmin: boolean;
}

// Branch Admin
export interface BranchAdmin {
  id: string;
  branchId: string;
  userId: string;
  
  // Permissions
  canManageStaff: boolean;
  canViewReports: boolean;
  canManageBookings: boolean;
  canManageServices: boolean;
  
  assignedAt: Date;
  assignedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Branch Admin with user details
export interface BranchAdminWithDetails extends BranchAdmin {
  fullName: string;
  email: string;
  avatarUrl?: string;
  branchName: string;
}

// Branch Statistics
export interface BranchStats {
  branchId: string;
  branchName: string;
  
  // Staff stats
  totalStaff: number;
  totalStylists: number;
  totalManagers: number;
  totalReceptionists: number;
  
  // Booking stats
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  todayBookings: number;
  monthlyBookings: number;
  
  // Revenue stats
  totalRevenue: number;
  monthlyRevenue: number;
  
  // Rating
  averageRating: number;
  totalReviews: number;
}

// Nearby Branch
export interface NearbyBranch extends Branch {
  distance: number; // in kilometers
}