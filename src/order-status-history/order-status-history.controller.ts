import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CreateOrderStatusHistoryDto } from './dto/create-order-status-history.dto';
import { OrderStatusHistoryService } from './order-status-history.service';
import { UpdateOrderStatusHistoryDto } from './dto/update-order-status-history.dto';
import { ORDER_PATTERNS } from 'src/orders/patterns/order-patterns';
import { ORDER_STATUS_HISTORY_PATTERNS } from './patterns/order-status-history-patterns';


@Controller()
export class OrderStatusHistoryController {
  constructor(private readonly orderStatusHistoryService: OrderStatusHistoryService) {}

  @MessagePattern(ORDER_STATUS_HISTORY_PATTERNS.CREATE)
  create(@Payload() createOrderDto: CreateOrderStatusHistoryDto) {
    return this.orderStatusHistoryService.create(createOrderDto);
  }

  @MessagePattern(ORDER_STATUS_HISTORY_PATTERNS.FIND_ALL)
  findAll() {
    return this.orderStatusHistoryService.findAll();
  }

  @MessagePattern(ORDER_STATUS_HISTORY_PATTERNS.FIND_ONE)
  findOne(@Payload() id: string) {
    return this.orderStatusHistoryService.findOne(id);
  }

  @MessagePattern(ORDER_STATUS_HISTORY_PATTERNS.UPDATE)
  update(@Payload() updateOrderDto: UpdateOrderStatusHistoryDto) {
    return this.orderStatusHistoryService.update(updateOrderDto.id, updateOrderDto);
  }

  @MessagePattern(ORDER_STATUS_HISTORY_PATTERNS.DELETE)
  remove(@Payload() id: string) {
    return this.orderStatusHistoryService.remove(id);
  }
}
