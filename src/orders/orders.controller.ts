import { Controller } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { ORDER_PATTERNS } from './patterns/order-patterns';
import { FindOneByOrgDto } from 'src/common/dto/find-one-by-org.dto';
// import { PaymentSucceededEvent } from './events/payment-succeeded.event';
// import { PaymentFailedEvent } from './events/payment-failed.event';
// import { PaymentRefundedEvent } from './events/payment-refunded.event';

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @MessagePattern(ORDER_PATTERNS.CREATE)
  create(@Payload() createOrderDto: CreateOrderDto) {
    return this.ordersService.create(createOrderDto);
  }

  // @MessagePattern(ORDER_PATTERNS.FIND_ALL)
  // findAll() {
  //   return this.ordersService.findAll();
  // }

  @MessagePattern(ORDER_PATTERNS.FIND_ONE)
  findOne(@Payload() dto: FindOneByOrgDto) {
    return this.ordersService.findOne(dto);
  }

  // @MessagePattern(ORDER_PATTERNS.CANCEL)
  // cancel(@Payload() id: string) {
  //   return this.ordersService.cancel(id);
  // }

  // // Event Handlers for Payment Events
  // // @EventPattern('order.updated')
  // // onPaymentSucceeded(event: PaymentSucceededEvent) {}

  // // @EventPattern('payment.failed')
  // // onPaymentFailed(event: PaymentFailedEvent) {}

  // // @EventPattern('payment.refunded')
  // // onPaymentRefunded(event: PaymentRefundedEvent) {}
}
