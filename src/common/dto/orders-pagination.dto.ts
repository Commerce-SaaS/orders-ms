import { Transform, Type } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { OrderStatus } from '../enums/order-status.enum';

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

  @IsOptional()
  @IsArray()
  @IsEnum(OrderStatus, { each: true })
  @Transform(({ value }) => {
    if (value === undefined || value === null) return value;
    return Array.isArray(value) ? value : [value];
  })
  status?: OrderStatus[];
}
