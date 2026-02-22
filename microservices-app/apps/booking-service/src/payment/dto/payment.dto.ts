import { IsString, IsOptional, MinLength } from 'class-validator';

export class CheckTransactionDto {
  @IsString()
  @MinLength(1)
  content: string; // Nội dung cần tra cứu
}

export class SepayWebhookDto {
  @IsOptional()
  id?: string | number;

  @IsOptional()
  @IsString()
  gateway?: string;

  @IsOptional()
  @IsString()
  transactionDate?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  transferAmount?: number;

  @IsOptional()
  @IsString()
  referenceCode?: string;
}