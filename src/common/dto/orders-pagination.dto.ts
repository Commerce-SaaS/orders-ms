import { Type } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class OrdersPaginationDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsUUID()
  organizationId!: string;
  
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  offset?: number;

  @IsOptional()
  @Min(0)
  @Type(() => Number)
  limit?: number;

  @IsString()
  @IsOptional()
  search?: string;

}
