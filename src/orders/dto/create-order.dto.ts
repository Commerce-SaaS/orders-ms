import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  IsEnum,
  IsArray,
  IsNumber,
  IsDate,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { OrderStatus } from 'src/common/enums/order-status.enum';
import { CreateOrderItemDto } from './create-order-item.dto';

export class CreateOrderDto {
  @IsUUID()
  organizationId: string;

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  // Must land exactly on a valid slot boundary for the org's configured
  // interval and be in the future. Omitted/null = "for now".
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledFor?: Date;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
