import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { AnalyticsRangeDto } from './analytics-range.dto';

export class AnalyticsTopProductsDto extends AnalyticsRangeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
