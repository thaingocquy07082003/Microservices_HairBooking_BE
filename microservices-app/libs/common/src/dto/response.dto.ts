import { IsOptional, IsInt, IsString } from 'class-validator';

export class ResponseDto<T> {
  @IsInt()
  statusCode: number;

  @IsString()
  message: string;

  @IsOptional()
  data?: T;

  @IsOptional()
  @IsString()
  error?: string;

  @IsString()
  timestamp: string;

  constructor(statusCode: number, message: string, data?: T, error?: string) {
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
    this.error = error;
    this.timestamp = new Date().toISOString();
  }
}
