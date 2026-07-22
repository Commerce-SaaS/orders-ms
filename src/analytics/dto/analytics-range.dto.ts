import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { AnalyticsPeriod } from 'src/common/enums/analytics-period.enum';

export class AnalyticsRangeDto {
  @IsUUID()
  organizationId: string;

  @IsEnum(AnalyticsPeriod)
  period: AnalyticsPeriod;

  // When omitted, the effective range is derived from `period` anchored to
  // "now" (e.g. period=month with no from/to -> the current calendar month).
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
