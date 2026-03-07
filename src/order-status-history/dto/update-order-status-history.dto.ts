import { PartialType } from '@nestjs/mapped-types';
import { CreateOrderStatusHistoryDto } from './create-order-status-history.dto';
import { IsUUID } from 'class-validator';

export class UpdateOrderStatusHistoryDto extends PartialType(
  CreateOrderStatusHistoryDto,
) {
  @IsUUID()
  id: string;
}
