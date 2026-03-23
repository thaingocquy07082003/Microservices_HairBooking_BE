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

  // YouCam S2S API config — v2.1
  private readonly YOUCAM_BASE_URL = 'https://yce-api-01.makeupar.com/s2s/v2.1';
  private readonly YOUCAM_HAIR_TRANSFER_URL = `${this.YOUCAM_BASE_URL}/task/hair-transfer`;

  // Polling config
  private readonly POLL_INTERVAL_MS = 2000;
  private readonly POLL_MAX_ATTEMPTS = 30; // 30 × 2s = 60s timeout

  constructor(
    private readonly configService: ConfigService,
    private readonly fileUploadService: FileUploadService,
  ) {
    this.supabase = createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_SERVICE_KEY'),
    );
  }

  /**
   * Main entry point: try on a hairstyle using YouCam API
   *
   * Luồng:
   *  1. Lấy hairstyle (name + image_url) từ DB
   *  2. Upload ảnh người dùng lên Cloudinary → lấy public URL
   *  3. Gửi { src_image_url, template_id | template_url } → YouCam → task_id
   *  4. Poll cho đến khi task_status = "success"
   *  5. Trả về result image URL
   *
   * Tại sao dùng Cloudinary thay vì gọi YouCam /file endpoint?
   *  YouCam v2 không có endpoint upload file riêng — nó nhận
   *  src_image_url (URL công khai) hoặc src_file_id (ID từ lần upload
   *  trước đó trong hệ thống YouCam, như trong test.js). Cách đơn giản
   *  nhất là upload ảnh người dùng lên Cloudinary rồi truyền URL vào.
   */
  async tryOnHairstyle(
    hairstyleId: string,
    userPhotoFile: Express.Multer.File,
  ): Promise<HairTryOnResultDto> {
    // ── Step 1: Lấy hairstyle từ DB ──────────────────────────────────
    const hairstyle = await this.getHairstyleById(hairstyleId);
    this.logger.log(`[TryOn] Hairstyle: "${hairstyle.name}" | template: ${hairstyle.image_url}`);

    // ── Step 2: Upload ảnh người dùng lên Cloudinary → lấy URL ───────
    const srcImageUrl = await this.fileUploadService.uploadImage(userPhotoFile);
    this.logger.log(`[TryOn] User photo uploaded: ${srcImageUrl}`);

    // ── Step 3: Xác định template payload ────────────────────────────
    // - Nếu image_url trong DB là YouCam template_id (không bắt đầu bằng http)
    //   thì dùng template_id (như trong test.js: "all_highlight_pixie_cut")
    // - Ngược lại dùng src_image_url cho template (ảnh kiểu tóc công khai)
    const templatePayload = this.buildTemplatePayload(hairstyle.image_url);

    // ── Step 4: Gọi YouCam hair-transfer ─────────────────────────────
    const taskId = await this.startHairTransferTask(srcImageUrl, templatePayload);
    this.logger.log(`[TryOn] Task started: ${taskId}`);

    // ── Step 5: Poll kết quả ─────────────────────────────────────────
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

  // ════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ════════════════════════════════════════════════════════════════════

  /** Lấy hairstyle từ Supabase */
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
   * Xác định template payload gửi cho YouCam:
   *  - template_id  → nếu image_url lưu trong DB là YouCam template ID
   *                    (vd: "all_highlight_pixie_cut") — không bắt đầu bằng http
   *  - template_url → nếu là URL ảnh công khai (Cloudinary, Unsplash…)
   *
   * Khuyến nghị: thêm cột `youcam_template_id` vào bảng hairstyles để
   * lưu template_id chính thức từ YouCam, sẽ cho kết quả chính xác hơn.
   */
  private buildTemplatePayload(imageUrl: string): Record<string, string> {
    const isYouCamTemplateId = !imageUrl.startsWith('http') && !imageUrl.startsWith('/');
    return isYouCamTemplateId
      ? { template_id: imageUrl }
      : { template_url: imageUrl };
  }

  /**
   * POST /s2s/v2.1/task/hair-transfer
   * Body: { src_image_url, template_id } hoặc { src_image_url, template_url }
   */
  private async startHairTransferTask(
    srcImageUrl: string,
    templatePayload: Record<string, string>,
  ): Promise<string> {
    const body = { src_image_url: srcImageUrl, ...templatePayload };

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
          `Lỗi gọi YouCam hair-transfer: ${err.response?.data?.message ?? err.message}`,
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
        this.logger.log(
          `[TryOn Poll] attempt=${attempt} status=${taskStatus}`,
        );

        if (taskStatus === 'success') {
          // Lấy URL ảnh kết quả (cấu trúc tuỳ YouCam API version)
          const results = response.data?.data?.results;
          const resultUrl: string | undefined =
            results?.[0]?.image_url ??   // Cấu trúc phổ biến
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
          throw new InternalServerErrorException(
            `YouCam task lỗi: ${errMsg}`,
          );
        }

        // Nếu status là 'processing' hoặc 'pending' thì tiếp tục poll
      } catch (err) {
        // Chỉ rethrow lỗi nghiệp vụ, còn lỗi mạng tạm thời thì tiếp tục poll
        if (
          err instanceof InternalServerErrorException ||
          err instanceof BadRequestException
        ) {
          throw err;
        }
        if (axios.isAxiosError(err) && err.response?.status !== undefined) {
          throw new InternalServerErrorException(
            `Lỗi poll task: ${err.message}`,
          );
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

  /** Lấy API key từ config */
  private get youcamApiKey(): string {
    return this.configService.getOrThrow<string>('YOUCAM_API_KEY');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}