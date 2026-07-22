import { IsUUID } from 'class-validator';

export class SendToKitchenDto {
  @IsUUID()
  orderId: string;

  @IsUUID()
  organizationId: string;
}
