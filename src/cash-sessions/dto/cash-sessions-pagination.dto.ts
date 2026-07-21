import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsUUID, Min } from 'class-validator';
import { CashSessionStatus } from 'src/common/enums/cash-session-status.enum';

export class CashSessionsPaginationDto {
  @IsUUID()
  organizationId: string;

  @IsOptional()
  @IsEnum(CashSessionStatus)
  status?: CashSessionStatus;

  @IsOptional()
  @Min(0)
  @Type(() => Number)
  offset?: number;

  @IsOptional()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}
