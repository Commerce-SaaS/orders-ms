import { Controller, Logger } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { ORDER_PATTERNS } from './patterns/order-patterns';
import { FindOneByOrgDto } from 'src/common/dto/find-one-by-org.dto';
import { OrdersPaginationDto } from 'src/common';
import { PaymentStatus } from 'src/common/enums/payment-status.enum';
import { AddOrderItemDto } from './dto/add-order-item.dto';
import { RemoveOrderItemDto } from './dto/remove-order-item.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';
import { CreatePosOrderDto } from './dto/create-pos-order.dto';
import { SendToKitchenDto } from './dto/send-to-kitchen.dto';
import { MarkItemPreparedDto } from './dto/mark-item-prepared.dto';
import { GetAvailableSlotsDto } from './dto/get-available-slots.dto';

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

  @MessagePattern(ORDER_PATTERNS.CREATE_POS)
  createPosOrder(@Payload() dto: CreatePosOrderDto) {
    return this.ordersService.createPosOrder(dto);
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
  onPaymentStatus(
    @Payload() data: { id: string; paymentStatus: PaymentStatus; organizationId: string },
  ) {
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

  @MessagePattern(ORDER_PATTERNS.ADD_ITEM)
  addItem(@Payload() dto: AddOrderItemDto) {
    return this.ordersService.addItem(dto);
  }

  @MessagePattern(ORDER_PATTERNS.REMOVE_ITEM)
  removeItem(@Payload() dto: RemoveOrderItemDto) {
    return this.ordersService.removeItem(dto);
  }

  @MessagePattern(ORDER_PATTERNS.UPDATE_ITEM)
  updateOrderItem(@Payload() dto: UpdateOrderItemDto) {
    return this.ordersService.updateOrderItem(dto);
  }

  @MessagePattern(ORDER_PATTERNS.AVAILABLE_SLOTS)
  availableSlots(@Payload() dto: GetAvailableSlotsDto) {
    return this.ordersService.getAvailableSlots(dto);
  }

  // Bulk-flips all NEW items on the order to SENT_TO_KITCHEN.
  // POS staff press "Send to kitchen" once per ticket; individual item
  // transitions are handled by markItemPrepared below (KDS side).
  @MessagePattern(ORDER_PATTERNS.SEND_TO_KITCHEN)
  sendToKitchen(@Payload() dto: SendToKitchenDto) {
    return this.ordersService.sendToKitchen(dto);
  }

  // Called by the KDS when a specific item is ready on the pass.
  // Only legal from SENT_TO_KITCHEN → PREPARED.
  @MessagePattern(ORDER_PATTERNS.MARK_ITEM_PREPARED)
  markItemPrepared(@Payload() dto: MarkItemPreparedDto) {
    return this.ordersService.markItemPrepared(dto);
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
