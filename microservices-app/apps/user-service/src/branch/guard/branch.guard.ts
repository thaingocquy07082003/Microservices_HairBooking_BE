import { 
  Injectable, 
  CanActivate, 
  ExecutionContext, 
  ForbiddenException 
} from '@nestjs/common';
import { Role } from '@app/common';
import { BranchesService } from '../branch.service';

/**
 * Guard kiểm tra quyền quản lý chi nhánh
 * 
 * Quy tắc:
 * 1. SuperAdmin: Có thể quản lý tất cả chi nhánh
 * 2. Admin: Có thể quản lý chi nhánh được phân công
 * 3. Manager: Chỉ có thể quản lý chi nhánh của mình
 */
@Injectable()
export class BranchManagementGuard implements CanActivate {
  constructor(private readonly branchesService: BranchesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const branchId = request.params.id || request.params.branchId;

    // SuperAdmin có thể quản lý tất cả
    if (user.role === Role.SuperAdmin) {
      return true;
    }

    // Admin hoặc Manager cần kiểm tra quyền
    if (user.role === Role.Admin || user.role === Role.Manager) {
      const isAdmin = await this.branchesService.isBranchAdmin(user.id, branchId);
      
      if (!isAdmin) {
        throw new ForbiddenException(
          'Bạn không có quyền quản lý chi nhánh này'
        );
      }
      
      return true;
    }

    throw new ForbiddenException('Bạn không có quyền quản lý chi nhánh');
  }
}

/**
 * Guard kiểm tra quyền quản lý nhân viên trong chi nhánh
 */
@Injectable()
export class BranchStaffManagementGuard implements CanActivate {
  constructor(private readonly branchesService: BranchesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const branchId = request.params.id || request.params.branchId;

    // SuperAdmin có thể quản lý tất cả
    if (user.role === Role.SuperAdmin) {
      return true;
    }

    // Kiểm tra xem user có phải là branch admin không
    const isAdmin = await this.branchesService.isBranchAdmin(user.id, branchId);
    
    if (!isAdmin) {
      throw new ForbiddenException(
        'Bạn không có quyền quản lý nhân viên của chi nhánh này'
      );
    }

    // Nếu là branch admin, kiểm tra quyền can_manage_staff
    if (user.role === Role.Admin) {
      // Get admin permissions
      const admins = await this.branchesService.getBranchAdmins(branchId);
      const adminPermissions = admins.find(a => a.userId === user.id);
      
      if (!adminPermissions?.canManageStaff) {
        throw new ForbiddenException(
          'Bạn không có quyền quản lý nhân viên (thiếu quyền can_manage_staff)'
        );
      }
    }

    return true;
  }
}

/**
 * Guard kiểm tra quyền xem báo cáo chi nhánh
 */
@Injectable()
export class BranchReportsGuard implements CanActivate {
  constructor(private readonly branchesService: BranchesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const branchId = request.params.id || request.params.branchId;

    // SuperAdmin có thể xem tất cả
    if (user.role === Role.SuperAdmin) {
      return true;
    }

    // Kiểm tra xem user có phải là branch admin không
    const isAdmin = await this.branchesService.isBranchAdmin(user.id, branchId);
    
    if (!isAdmin) {
      throw new ForbiddenException(
        'Bạn không có quyền xem báo cáo của chi nhánh này'
      );
    }

    // Kiểm tra quyền can_view_reports
    const admins = await this.branchesService.getBranchAdmins(branchId);
    const adminPermissions = admins.find(a => a.userId === user.id);
    
    if (!adminPermissions?.canViewReports) {
      throw new ForbiddenException(
        'Bạn không có quyền xem báo cáo (thiếu quyền can_view_reports)'
      );
    }

    return true;
  }
}

/**
 * Guard kiểm tra quyền tạo/xóa chi nhánh (chỉ SuperAdmin và Admin hệ thống)
 */
@Injectable()
export class SystemAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user.role !== Role.SuperAdmin && user.role !== Role.Admin) {
      throw new ForbiddenException(
        'Chỉ SuperAdmin và Admin hệ thống mới có quyền thực hiện thao tác này'
      );
    }

    return true;
  }
}