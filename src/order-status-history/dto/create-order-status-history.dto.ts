import { IsEnum, IsUUID } from 'class-validator';
import { OrderStatus } from 'src/common/enums/order-status.enum';

export class CreateOrderStatusHistoryDto {
  @IsUUID()
  organizationId: string;

  @IsUUID()
  orderId: string;

  @IsEnum(OrderStatus)
  status: OrderStatus;
}
