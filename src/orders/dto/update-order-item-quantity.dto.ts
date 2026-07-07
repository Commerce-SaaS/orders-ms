import { IsInt, IsUUID, Min } from 'class-validator';

export class UpdateOrderItemQuantityDto {
  @IsUUID()
  orderId: string;

  @IsUUID()
  itemId: string;

  @IsUUID()
  organizationId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}
