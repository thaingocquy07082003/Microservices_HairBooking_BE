import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Role } from '@app/common';
import { HairstylesService } from '../hairstyles.service';

/**
 * Guard để kiểm tra HairStylist chỉ được cập nhật thông tin của chính mình
 * Admin và SuperAdmin có thể cập nhật bất kỳ stylist nào
 */
@Injectable()
export class SelfUpdateGuard implements CanActivate {
  constructor(private readonly hairstylesService: HairstylesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const stylistId = request.params.id;

    // Admin và SuperAdmin có thể update bất kỳ stylist nào
    if (user.role === Role.Admin || user.role === Role.SuperAdmin) {
      return true;
    }

    // HairStylist chỉ được update chính mình
    if (user.role === Role.HairStylist) {
      try {
        // Lấy thông tin stylist để kiểm tra user_id
        const stylist = await this.hairstylesService.getStylistById(stylistId);
        
        // Kiểm tra xem stylist này có thuộc về user hiện tại không
        if (stylist.userId !== user.id) {
          throw new ForbiddenException(
            'Bạn chỉ được phép cập nhật thông tin của chính mình'
          );
        }
        
        return true;
      } catch (error) {
        if (error instanceof ForbiddenException) {
          throw error;
        }
        throw new ForbiddenException('Không thể xác thực quyền truy cập');
      }
    }

    throw new ForbiddenException('Bạn không có quyền cập nhật thông tin thợ cắt tóc');
  }
}