import { IsString, IsUUID } from 'class-validator';

export class HairTryOnDto {
  @IsString()
  @IsUUID()
  hairstyleId: string;
  // userPhoto comes as multipart/form-data file — handled by FileInterceptor
}

export class HairTryOnResultDto {
  taskId: string;
  status: 'success' | 'error' | 'processing';
  resultImageUrl?: string;
  hairstyleId: string;
  hairstyleName: string;
}