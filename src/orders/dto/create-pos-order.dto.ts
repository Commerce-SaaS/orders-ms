import { Type } from 'class-transformer';
import { IsDate, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { OrderType } from 'src/common/enums/order-type.enum';

export class CreatePosOrderDto {
  @IsUUID()
  organizationId: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  customerAddress?: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsOptional()
  @IsEnum(OrderType)
  orderType?: OrderType;

  @IsOptional()
  @IsUUID()
  tableId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  partySize?: number;

  // Must land exactly on a valid slot boundary for the org's configured
  // interval and be in the future. Omitted/null = "for now".
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledFor?: Date;
}
