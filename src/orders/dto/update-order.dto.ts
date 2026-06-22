import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsUUID, IsEnum } from 'class-validator';
import { CreateOrderDto } from './create-order.dto';
import { OrderStatus } from 'src/common/enums/order-status.enum';
import { PaymentStatus } from 'src/common/enums/payment-status.enum';

export class UpdateOrderDto extends PartialType(CreateOrderDto) {
  @IsUUID()
  id!: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;
}
