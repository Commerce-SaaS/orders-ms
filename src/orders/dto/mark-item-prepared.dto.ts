import { IsUUID } from 'class-validator';

export class MarkItemPreparedDto {
  @IsUUID()
  orderId: string;

  @IsUUID()
  itemId: string;

  @IsUUID()
  organizationId: string;
}
