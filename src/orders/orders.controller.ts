import { Controller, Logger } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { ORDER_PATTERNS } from './patterns/order-patterns';
import { FindOneByOrgDto } from 'src/common/dto/find-one-by-org.dto';
import { OrdersPaginationDto } from 'src/common';

@Controller()
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);
  constructor(private readonly ordersService: OrdersService) {}

  @MessagePattern(ORDER_PATTERNS.CREATE)
  create(@Payload() createOrderDto: CreateOrderDto) {
    this.logger.log(
      `[ORDER-FLOW] handler received: userId=${createOrderDto.userId} organizationId=${createOrderDto.organizationId} itemCount=${createOrderDto.items?.length ?? 0}`,
    );
    return this.ordersService.create(createOrderDto);
  }

  @MessagePattern(ORDER_PATTERNS.FIND_ALL)
  findAll(@Payload() paginationDto: OrdersPaginationDto) {
    return this.ordersService.findAll(paginationDto);
  }

  @MessagePattern(ORDER_PATTERNS.UPDATE)
  update(@Payload() updateOrderDto: UpdateOrderDto) {
    return this.ordersService.update(updateOrderDto);
  }

  @MessagePattern(ORDER_PATTERNS.FIND_ONE)
  findOne(@Payload() dto: FindOneByOrgDto) {
    return this.ordersService.findOne(dto);
  }

  // Event Handlers for Payment Events
  @EventPattern(ORDER_PATTERNS.PAYMENT_STATUS)
  onPaymentStatus(@Payload() data: UpdateOrderDto) {
    if (data.paymentStatus && data.organizationId) {
      return this.ordersService.updatePaymentStatus(
        data.id,
        data.paymentStatus,
        data.organizationId,
      );
    } else {
      this.logger.warn(
        `PAYMENT_STATUS event ignored: missing fields ` +
          `(orderId=${data.id ?? 'none'}, ` +
          `paymentStatus=${data.paymentStatus ?? 'none'}, ` +
          `organizationId=${data.organizationId ?? 'none'})`,
      );
    }
  }

  // Received from auth-ms after a customer is anonymized.
  // Nulls the denormalized customerName so no real name survives in orders-ms.
  @EventPattern(ORDER_PATTERNS.CUSTOMER_ANONYMIZED)
  async onCustomerAnonymized(@Payload() data: { userId: string }) {
    try {
      await this.ordersService.anonymizeCustomerOrders(data.userId);
    } catch (error) {
      // Log and swallow — a failure here must not crash the RabbitMQ consumer.
      this.logger.error(
        `customer.anonymized: failed to anonymize orders for userId=${data.userId}: ${error?.message}`,
      );
    }
  }
}
