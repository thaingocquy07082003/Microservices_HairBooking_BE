import {
  Controller,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { HairTryOnService } from './hair-tryon.service';
import { HairTryOnDto } from './dto/hair-tryon.dto';
import { JwtAuthGuard } from '@app/common';

@Controller('hairstyles/try-on')
export class HairTryOnController {
  constructor(private readonly hairTryOnService: HairTryOnService) {}

  /**
   * [AUTHENTICATED] Thử kiểu tóc ảo bằng YouCam AI
   *
   * POST /api/v1/hairstyles/try-on
   *
   * Body (multipart/form-data):
   *   - hairstyleId  string (UUID)   — ID kiểu tóc trong DB
   *   - userPhoto    File (image/*)  — Ảnh khuôn mặt người dùng
   *
   * Response:
   *   {
   *     "taskId": "...",
   *     "status": "success",
   *     "resultImageUrl": "https://...",
   *     "hairstyleId": "...",
   *     "hairstyleName": "Undercut Classic"
   *   }
   */
  @Post()
  @UseGuards(JwtAuthGuard)           // Yêu cầu đăng nhập
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('userPhoto', {
      storage: memoryStorage(),        // Giữ file trong RAM để upload YouCam
      limits: {
        fileSize: 10 * 1024 * 1024,   // Tối đa 10MB
      },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(
            new BadRequestException('Chỉ chấp nhận file ảnh (image/*)'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async tryOnHairstyle(
    @Body() dto: HairTryOnDto,
    @UploadedFile() userPhoto: Express.Multer.File,
  ) {
    if (!userPhoto) {
      throw new BadRequestException(
        'Vui lòng tải lên ảnh của bạn (field: userPhoto)',
      );
    }

    const result = await this.hairTryOnService.tryOnHairstyle(
      dto.hairstyleId,
      userPhoto,
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'Thử kiểu tóc thành công',
      data: result,
      timestamp: new Date().toISOString(),
    };
  }
}