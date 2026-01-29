import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Role } from '@app/common';
import { ProfilesService } from '../profile.service';

/**
 * Guard để kiểm tra quyền cập nhật profile
 * 
 * Quy tắc phân quyền:
 * 1. SuperAdmin: Có thể cập nhật bất kỳ profile nào
 * 2. Admin: Có thể cập nhật profile của Manager, Staff, Stylist, Customer (không thể sửa SuperAdmin)
 * 3. Manager: Có thể cập nhật profile của Staff, Stylist, Customer (không thể sửa Admin, SuperAdmin)
 * 4. Mọi user: Có thể cập nhật profile của chính mình
 */
@Injectable()
export class ProfileUpdateGuard implements CanActivate {
  constructor(private readonly profilesService: ProfilesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const currentUser = request.user;
    const targetUserId = request.params.id;

    // Nếu user đang cập nhật chính mình -> cho phép
    if (currentUser.id === targetUserId) {
      return true;
    }

    // Lấy thông tin profile của target user
    const targetProfile = await this.profilesService.getProfileById(targetUserId);

    // SuperAdmin có thể cập nhật tất cả
    if (currentUser.role === Role.SuperAdmin) {
      return true;
    }

    // Admin có thể cập nhật tất cả trừ SuperAdmin
    if (currentUser.role === Role.Admin) {
      if (targetProfile.role === Role.SuperAdmin) {
        throw new ForbiddenException('Admin không thể cập nhật profile của SuperAdmin');
      }
      return true;
    }

    // Manager chỉ có thể cập nhật Customer, Staff, Stylist
    if (currentUser.role === Role.Manager) {
      const allowedRoles = [Role.Customer, Role.Receptionist, Role.HairStylist];
      if (!allowedRoles.includes(targetProfile.role as Role)) {
        throw new ForbiddenException(
          'Manager chỉ có thể cập nhật profile của Customer, Staff và Stylist'
        );
      }
      return true;
    }

    // Các role khác không có quyền cập nhật profile người khác
    throw new ForbiddenException('Bạn không có quyền cập nhật profile này');
  }
}

/**
 * Guard để kiểm tra quyền xem danh sách profiles
 * Chỉ Admin, SuperAdmin, Manager mới có quyền xem danh sách
 */
@Injectable()
export class ViewProfilesListGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const allowedRoles = [Role.SuperAdmin, Role.Admin, Role.Manager];
    
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException('Bạn không có quyền xem danh sách profiles');
    }

    return true;
  }
}