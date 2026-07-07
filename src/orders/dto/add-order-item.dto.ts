import { Type } from 'class-transformer';
import { IsUUID, ValidateNested } from 'class-validator';
import { CreateOrderItemDto } from './create-order-item.dto';

export class AddOrderItemDto {
  @IsUUID()
  orderId: string;

  @IsUUID()
  organizationId: string;

  @ValidateNested()
  @Type(() => CreateOrderItemDto)
  item: CreateOrderItemDto;
}
