import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { FileUploadService } from '@app/common';
import axios from 'axios';
import { HairTryOnResultDto } from './dto/hair-tryon.dto';

@Injectable()
export class HairTryOnService {
  private readonly logger = new Logger(HairTryOnService.name);
  private supabase: SupabaseClient;

  private readonly YOUCAM_BASE_URL = 'https://yce-api-01.makeupar.com/s2s/v2.1';
  private readonly YOUCAM_HAIR_TRANSFER_URL = `${this.YOUCAM_BASE_URL}/task/hair-transfer`;

  private readonly POLL_INTERVAL_MS = 2000;
  private readonly POLL_MAX_ATTEMPTS = 30;

  constructor(
    private readonly configService: ConfigService,
    private readonly fileUploadService: FileUploadService,
  ) {
    this.supabase = createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_SERVICE_KEY'),
    );
  }

  async tryOnHairstyle(
    hairstyleId: string,
    userPhotoFile: Express.Multer.File,
  ): Promise<HairTryOnResultDto> {
    // Step 1: Lấy hairstyle từ DB
    const hairstyle = await this.getHairstyleById(hairstyleId);
    this.logger.log(`[TryOn] Hairstyle: "${hairstyle.name}" | template: ${hairstyle.image_url}`);

    // Step 2: Upload ảnh người dùng lên Cloudinary → lấy URL công khai
    const srcFileUrl = await this.fileUploadService.uploadImage(userPhotoFile);
    this.logger.log(`[TryOn] User photo uploaded: ${srcFileUrl}`);

    // Step 3: Xác định template payload
    // YouCam v2.1 chấp nhận:
    //   - template_id  nếu image_url là YouCam template ID (vd: "all_highlight_pixie_cut")
    //   - ref_file_url nếu là URL ảnh công khai (Cloudinary, Unsplash…)
    const templatePayload = this.buildTemplatePayload(hairstyle.image_url);

    // Step 4: Gọi YouCam hair-transfer → nhận task_id
    const taskId = await this.startHairTransferTask(srcFileUrl, templatePayload);
    this.logger.log(`[TryOn] Task started: ${taskId}`);

    // Step 5: Poll kết quả
    const resultImageUrl = await this.pollTaskUntilDone(taskId);
    this.logger.log(`[TryOn] Result: ${resultImageUrl}`);

    return {
      taskId,
      status: 'success',
      resultImageUrl,
      hairstyleId,
      hairstyleName: hairstyle.name,
    };
  }

  // ── PRIVATE HELPERS ──────────────────────────────────────────────────

  private async getHairstyleById(
    id: string,
  ): Promise<{ name: string; image_url: string }> {
    const { data, error } = await this.supabase
      .from('hairstyles')
      .select('name, image_url')
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Không tìm thấy kiểu tóc với ID: ${id}`);
    }

    if (!data.image_url) {
      throw new BadRequestException(`Kiểu tóc "${data.name}" chưa có ảnh mẫu.`);
    }

    return data;
  }

  /**
   * Xác định template payload:
   *   - image_url KHÔNG bắt đầu bằng "http" → là YouCam template_id
   *   - image_url bắt đầu bằng "http"       → là URL công khai, dùng ref_file_url
   *
   * YouCam API v2.1 field names:
   *   src_file_url  = ảnh người dùng (URL công khai)
   *   template_id   = ID template kiểu tóc từ YouCam
   *   ref_file_url  = ảnh kiểu tóc từ URL bên ngoài
   */
  private buildTemplatePayload(imageUrl: string): Record<string, string> {
    const isYouCamTemplateId = !imageUrl.startsWith('http') && !imageUrl.startsWith('/');
    return isYouCamTemplateId
      ? { template_id: imageUrl }
      : { ref_file_url: imageUrl }; // ✅ Đúng field name, không phải template_url
  }

  /**
   * POST /s2s/v2.1/task/hair-transfer
   *
   * Body hợp lệ (một trong các dạng):
   *   { src_file_url, template_id }
   *   { src_file_url, ref_file_url }
   *   { src_file_id,  template_id }
   *
   * ❌ KHÔNG dùng src_image_url hay template_url — YouCam không nhận
   */
  private async startHairTransferTask(
    srcFileUrl: string,
    templatePayload: Record<string, string>,
  ): Promise<string> {
    const body = { src_file_url: srcFileUrl, ...templatePayload }; // ✅ src_file_url

    this.logger.log(`[YouCam] POST hair-transfer body: ${JSON.stringify(body)}`);

    try {
      const response = await axios.post(this.YOUCAM_HAIR_TRANSFER_URL, body, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.youcamApiKey}`,
        },
      });

      const taskId: string | undefined = response.data?.data?.task_id;
      if (!taskId) {
        throw new InternalServerErrorException(
          `YouCam không trả về task_id: ${JSON.stringify(response.data)}`,
        );
      }

      return taskId;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[YouCam Start] ${err.response?.status} – ${JSON.stringify(err.response?.data)}`,
        );
        throw new BadRequestException(
          `Lỗi gọi YouCam hair-transfer: ${err.response?.data?.error ?? err.message}`,
        );
      }
      throw err;
    }
  }

  /**
   * Poll GET /s2s/v2.1/task/hair-transfer/{task_id}
   * cho đến khi task_status = 'success' hoặc 'error'
   */
  private async pollTaskUntilDone(taskId: string): Promise<string> {
    const pollUrl = `${this.YOUCAM_HAIR_TRANSFER_URL}/${encodeURIComponent(taskId)}`;

    for (let attempt = 1; attempt <= this.POLL_MAX_ATTEMPTS; attempt++) {
      await this.sleep(this.POLL_INTERVAL_MS);

      try {
        const response = await axios.get(pollUrl, {
          headers: {
            Authorization: `Bearer ${this.youcamApiKey}`,
          },
        });

        const taskStatus: string = response.data?.data?.task_status;
        this.logger.log(`[TryOn Poll] attempt=${attempt} status=${taskStatus}`);

        if (taskStatus === 'success') {
          const results = response.data?.data?.results;
          const resultUrl: string | undefined =
            results?.[0]?.image_url ??
            results?.[0]?.url ??
            results?.image_url ??
            results?.url;

          if (!resultUrl) {
            throw new InternalServerErrorException(
              `Task thành công nhưng không tìm thấy URL ảnh kết quả: ${JSON.stringify(response.data)}`,
            );
          }

          return resultUrl;
        }

        if (taskStatus === 'error') {
          const errMsg =
            response.data?.data?.error_message ?? 'YouCam task thất bại';
          throw new InternalServerErrorException(`YouCam task lỗi: ${errMsg}`);
        }

        // status là 'processing' hoặc 'pending' → tiếp tục poll
      } catch (err) {
        if (
          err instanceof InternalServerErrorException ||
          err instanceof BadRequestException
        ) {
          throw err;
        }
        if (axios.isAxiosError(err) && err.response?.status !== undefined) {
          throw new InternalServerErrorException(`Lỗi poll task: ${err.message}`);
        }
        this.logger.warn(
          `[TryOn Poll] attempt=${attempt} – network error, retrying…`,
        );
      }
    }

    throw new InternalServerErrorException(
      `Hết thời gian chờ kết quả YouCam (${(this.POLL_MAX_ATTEMPTS * this.POLL_INTERVAL_MS) / 1000}s)`,
    );
  }

  private get youcamApiKey(): string {
    return this.configService.getOrThrow<string>('YOUCAM_API_KEY');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}