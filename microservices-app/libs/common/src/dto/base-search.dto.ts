import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class BaseSearchDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  limit: number;

  @IsOptional()
  sortBy?: string;

  @IsOptional()
  order?: string;

  @IsOptional()
  keyWord?: string;

  constructor(partial?: Partial<BaseSearchDto>) {
    if (partial) {
      Object.assign(this, partial);
    }
  }
}
