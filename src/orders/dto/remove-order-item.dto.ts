import { IsUUID } from 'class-validator';

export class RemoveOrderItemDto {
  @IsUUID()
  orderId: string;

  @IsUUID()
  itemId: string;

  @IsUUID()
  organizationId: string;
}
