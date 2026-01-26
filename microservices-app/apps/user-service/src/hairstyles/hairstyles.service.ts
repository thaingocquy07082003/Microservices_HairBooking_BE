// apps/user-service/src/hairstyles/hairstyles.service.ts

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { RedisService } from '@app/redis';
import { Hairstyle, Stylist } from '@app/common';
import { CreateHairstyleDto, UpdateHairstyleDto, FilterHairstyleDto } from './dto/hairstyles.dto';

@Injectable()
export class HairstylesService {
  private readonly HAIRSTYLE_PREFIX = 'hairstyle:';
  private readonly HAIRSTYLES_LIST_KEY = 'hairstyles:list';
  private readonly STYLIST_PREFIX = 'stylist:';
  private readonly STYLISTS_LIST_KEY = 'stylists:list';

  constructor(private readonly redisService: RedisService) {}

  // ==================== HAIRSTYLE METHODS ====================

  async createHairstyle(dto: CreateHairstyleDto): Promise<Hairstyle> {
    const id = `hs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Kiểm tra các stylist có tồn tại không
    for (const stylistId of dto.stylistIds) {
      const stylist = await this.redisService.get<Stylist>(`${this.STYLIST_PREFIX}${stylistId}`);
      if (!stylist) {
        throw new BadRequestException(`Không tìm thấy thợ cắt tóc với ID: ${stylistId}`);
      }
    }
    
    const hairstyle: Hairstyle = {
      id,
      ...dto,
      isActive: dto.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Lưu hairstyle vào Redis
    await this.redisService.set(`${this.HAIRSTYLE_PREFIX}${id}`, hairstyle);
    
    // Thêm ID vào danh sách
    const hairstylesList = await this.redisService.get<string[]>(this.HAIRSTYLES_LIST_KEY) || [];
    hairstylesList.push(id);
    await this.redisService.set(this.HAIRSTYLES_LIST_KEY, hairstylesList);

    return hairstyle;
  }

  async getHairstyleById(id: string): Promise<Hairstyle> {
    const hairstyle = await this.redisService.get<Hairstyle>(`${this.HAIRSTYLE_PREFIX}${id}`);
    
    if (!hairstyle) {
      throw new NotFoundException(`Không tìm thấy kiểu tóc với ID: ${id}`);
    }

    return hairstyle;
  }

  async getAllHairstyles(filter: FilterHairstyleDto): Promise<{
    data: Hairstyle[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const hairstyleIds = await this.redisService.get<string[]>(this.HAIRSTYLES_LIST_KEY) || [];
    
    // Lấy tất cả hairstyles
    const allHairstyles: Hairstyle[] = [];
    for (const id of hairstyleIds) {
      const hairstyle = await this.redisService.get<Hairstyle>(`${this.HAIRSTYLE_PREFIX}${id}`);
      if (hairstyle) {
        allHairstyles.push(hairstyle);
      }
    }

    // Áp dụng filters
    let filteredHairstyles = allHairstyles.filter(h => {
      // Filter by active status
      if (filter.isActive !== undefined && h.isActive !== filter.isActive) {
        return false;
      }

      // Filter by category
      if (filter.category && h.category !== filter.category) {
        return false;
      }

      // Filter by price range
      if (filter.minPrice !== undefined && h.price < filter.minPrice) {
        return false;
      }
      if (filter.maxPrice !== undefined && h.price > filter.maxPrice) {
        return false;
      }

      // Filter by stylist
      if (filter.stylistId && !h.stylistIds.includes(filter.stylistId)) {
        return false;
      }

      // Filter by difficulty
      if (filter.difficulty && h.difficulty !== filter.difficulty) {
        return false;
      }

      // Search by name
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        if (!h.name.toLowerCase().includes(searchLower) && 
            !h.description.toLowerCase().includes(searchLower)) {
          return false;
        }
      }

      return true;
    });

    // Sorting
    filteredHairstyles.sort((a, b) => {
      const sortBy = filter.sortBy || 'createdAt';
      const order = filter.order || 'desc';
      
      let aValue = a[sortBy];
      let bValue = b[sortBy];

      // Handle Date objects
      if (aValue instanceof Date) aValue = aValue.getTime();
      if (bValue instanceof Date) bValue = bValue.getTime();

      if (order === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    // Pagination
    const page = filter.page || 1;
    const limit = filter.limit || 10;
    const total = filteredHairstyles.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    const data = filteredHairstyles.slice(startIndex, endIndex);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getHairstylesByStylist(stylistId: string): Promise<Hairstyle[]> {
    // Kiểm tra stylist có tồn tại không
    const stylist = await this.getStylistById(stylistId);
    
    const hairstyleIds = await this.redisService.get<string[]>(this.HAIRSTYLES_LIST_KEY) || [];
    const hairstyles: Hairstyle[] = [];

    for (const id of hairstyleIds) {
      const hairstyle = await this.redisService.get<Hairstyle>(`${this.HAIRSTYLE_PREFIX}${id}`);
      if (hairstyle && hairstyle.stylistIds.includes(stylistId) && hairstyle.isActive) {
        hairstyles.push(hairstyle);
      }
    }

    // Sắp xếp theo giá
    return hairstyles.sort((a, b) => a.price - b.price);
  }

  async updateHairstyle(id: string, dto: UpdateHairstyleDto): Promise<Hairstyle> {
    const hairstyle = await this.getHairstyleById(id);

    // Kiểm tra các stylist mới có tồn tại không
    if (dto.stylistIds) {
      for (const stylistId of dto.stylistIds) {
        const stylist = await this.redisService.get<Stylist>(`${this.STYLIST_PREFIX}${stylistId}`);
        if (!stylist) {
          throw new BadRequestException(`Không tìm thấy thợ cắt tóc với ID: ${stylistId}`);
        }
      }
    }

    const updatedHairstyle: Hairstyle = {
      ...hairstyle,
      ...dto,
      updatedAt: new Date(),
    };

    await this.redisService.set(`${this.HAIRSTYLE_PREFIX}${id}`, updatedHairstyle);

    return updatedHairstyle;
  }

  async deleteHairstyle(id: string): Promise<void> {
    const hairstyle = await this.getHairstyleById(id);

    // Soft delete: chỉ set isActive = false
    hairstyle.isActive = false;
    hairstyle.updatedAt = new Date();
    
    await this.redisService.set(`${this.HAIRSTYLE_PREFIX}${id}`, hairstyle);
  }

  // ==================== STYLIST METHODS ====================

  async createStylist(dto: any): Promise<Stylist> {
    const id = `st_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const stylist: Stylist = {
      id,
      ...dto,
      rating: 0,
      totalBookings: 0,
      isAvailable: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.redisService.set(`${this.STYLIST_PREFIX}${id}`, stylist);
    
    const stylistsList = await this.redisService.get<string[]>(this.STYLISTS_LIST_KEY) || [];
    stylistsList.push(id);
    await this.redisService.set(this.STYLISTS_LIST_KEY, stylistsList);

    return stylist;
  }

  async getStylistById(id: string): Promise<Stylist> {
    const stylist = await this.redisService.get<Stylist>(`${this.STYLIST_PREFIX}${id}`);
    
    if (!stylist) {
      throw new NotFoundException(`Không tìm thấy thợ cắt tóc với ID: ${id}`);
    }

    return stylist;
  }

  async getAllStylists(): Promise<Stylist[]> {
    const stylistIds = await this.redisService.get<string[]>(this.STYLISTS_LIST_KEY) || [];
    const stylists: Stylist[] = [];

    for (const id of stylistIds) {
      const stylist = await this.redisService.get<Stylist>(`${this.STYLIST_PREFIX}${id}`);
      if (stylist && stylist.isAvailable) {
        stylists.push(stylist);
      }
    }

    // Sắp xếp theo rating cao nhất
    return stylists.sort((a, b) => b.rating - a.rating);
  }

  async updateStylist(id: string, dto: any): Promise<Stylist> {
    const stylist = await this.getStylistById(id);

    const updatedStylist: Stylist = {
      ...stylist,
      ...dto,
      updatedAt: new Date(),
    };

    await this.redisService.set(`${this.STYLIST_PREFIX}${id}`, updatedStylist);

    return updatedStylist;
  }

  async deleteStylist(id: string): Promise<void> {
    const stylist = await this.getStylistById(id);

    // Soft delete: set isAvailable = false
    stylist.isAvailable = false;
    stylist.updatedAt = new Date();

    await this.redisService.set(`${this.STYLIST_PREFIX}${id}`, stylist);
  }
}