import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Role } from '@app/common';

/**
 * Guard để kiểm tra HairStylist chỉ được cập nhật thông tin của chính mình
 * Admin và SuperAdmin có thể cập nhật bất kỳ stylist nào
 */
@Injectable()
export class SelfUpdateGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const stylistId = request.params.id;

    // Admin và SuperAdmin có thể update bất kỳ stylist nào
    if (user.role === Role.Admin || user.role === Role.SuperAdmin) {
      return true;
    }

    // HairStylist chỉ được update chính mình
    if (user.role === Role.HairStylist) {
      // Giả sử user.stylistId là ID của stylist record liên kết với user
      // Bạn cần lấy stylistId từ user hoặc từ database
      if (user.stylistId !== stylistId) {
        throw new ForbiddenException(
          'Bạn chỉ được phép cập nhật thông tin của chính mình'
        );
      }
      return true;
    }

    throw new ForbiddenException('Bạn không có quyền cập nhật thông tin thợ cắt tóc');
  }
}