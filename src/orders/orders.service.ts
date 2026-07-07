import { Inject, Injectable, Logger } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderStatus } from 'src/common/enums/order-status.enum';
import { DataSource, EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderItemExtra } from './entities/order-item-extra.entity';
import { OrderItemRemovedIngredient } from './entities/order-item-removed-ingredient.entity';
import { RpcExceptionHelper } from 'src/common/helpers/rpc-exception.helper';
import { FindOneByOrgDto } from 'src/common/dto/find-one-by-org.dto';
import { PaymentStatus } from 'src/common/enums/payment-status.enum';
import { OrdersPaginationDto } from 'src/common/dto/orders-pagination.dto';
import { CreateOrderItemDto } from './dto/create-order-item.dto';
import { AddOrderItemDto } from './dto/add-order-item.dto';
import { RemoveOrderItemDto } from './dto/remove-order-item.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';
import { CreatePosOrderDto } from './dto/create-pos-order.dto';
import { OrderItemStatus } from 'src/common/enums/order-item-status.enum';
import { SendToKitchenDto } from './dto/send-to-kitchen.dto';
import { MarkItemPreparedDto } from './dto/mark-item-prepared.dto';
import { ClientProxy } from '@nestjs/microservices';
import { PAYMENTS_EVENTS_CLIENT } from 'src/config/services';
import { ORDER_PATTERNS } from './patterns/order-patterns';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @Inject(PAYMENTS_EVENTS_CLIENT)
    private readonly paymentsEventsClient: ClientProxy,
  ) { }

  // ===============================
  // CREATE ORDER
  // ===============================
  async create(createOrderDto: CreateOrderDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { items, userId, status, organizationId, customerName } =
        createOrderDto;

      this.logger.log(
        `[ORDER-FLOW] create: start userId=${userId} organizationId=${organizationId} itemCount=${items?.length ?? 0}`,
      );

      const { subtotal, total } = this.calculateTotals(items);

      this.logger.log(
        `[ORDER-FLOW] create: totals calculated subtotal=${subtotal} total=${total} — generating orderNumber`,
      );

      const order = queryRunner.manager.create(Order, {
        organizationId,
        userId,
        status: status ?? OrderStatus.PENDING,
        subtotal,
        total,
        customerName,
        orderNumber: await this.generateOrderNumber(organizationId, queryRunner.manager),
      });

      await queryRunner.manager.save(order);

      this.logger.log(
        `[ORDER-FLOW] create: order row saved orderId=${order.id} orderNumber=${order.orderNumber} — saving ${items.length} item(s)`,
      );

      for (const item of items) {
        const extrasTotal =
          item.extras?.reduce(
            (sum, extra) => sum + extra.price * extra.quantity,
            0,
          ) ?? 0;

        const itemTotal = (item.unitPrice + extrasTotal) * item.quantity;

        const orderItem = queryRunner.manager.create(OrderItem, {
          organizationId,
          orderId: order.id,
          productId: item.productId,
          name: item.name,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          total: itemTotal,
        });

        await queryRunner.manager.save(orderItem);

        // Guardar extras
        if (item.extras?.length) {
          for (const extra of item.extras) {
            const orderExtra = queryRunner.manager.create(OrderItemExtra, {
              organizationId,
              orderItemId: orderItem.id,
              extraId: extra.extraId,
              name: extra.name,
              price: extra.price,
              quantity: extra.quantity,
              total: extra.price * extra.quantity,
            });

            await queryRunner.manager.save(orderExtra);
          }
        }

        // Guardar ingredientes removidos
        if (item.removedIngredients?.length) {
          for (const removed of item.removedIngredients) {
            const removedIngredient = queryRunner.manager.create(
              OrderItemRemovedIngredient,
              {
                organizationId,
                orderItemId: orderItem.id,
                ingredientId: removed.ingredientId,
                ingredientName: removed.ingredientName,
              },
            );

            await queryRunner.manager.save(removedIngredient);
          }
        }
      }

      await queryRunner.commitTransaction();

      this.logger.log(
        `[ORDER-FLOW] create: transaction committed orderId=${order.id} — fetching stripe line items`,
      );

      return this.mapOrderToStripeLineItems(order.id, organizationId);
    } catch (error) {
      this.logger.error(
        `[ORDER-FLOW] create: ERROR userId=${createOrderDto.userId} organizationId=${createOrderDto.organizationId} — ${error?.message}`,
        error?.stack,
      );
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ===============================
  // CREATE POS ORDER (empty — items added incrementally via /orders/:id/items)
  // ===============================
  async createPosOrder(dto: CreatePosOrderDto) {
    const { organizationId, customerName } = dto;
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const order = queryRunner.manager.create(Order, {
        organizationId,
        customerName,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        subtotal: 0,
        total: 0,
        orderNumber: await this.generateOrderNumber(organizationId, queryRunner.manager),
      });

      await queryRunner.manager.save(order);
      await queryRunner.commitTransaction();

      // Reload with relations so mapOrderResponse receives items: []
      const loaded = await this.dataSource.getRepository(Order).findOne({
        where: { id: order.id, organizationId },
        relations: ['items', 'items.extras', 'items.removedIngredients'],
      });
      if (!loaded) RpcExceptionHelper.notFound('Order');

      return this.mapOrderResponse(loaded);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ===============================
  // FIND ORDER
  // ===============================

  async findOne(dto: FindOneByOrgDto) {
    const where: FindOptionsWhere<Order> = {
      id: dto.id,
      organizationId: dto.organizationId,
    };
    if (dto.userId) where.userId = dto.userId;

    const order = await this.dataSource.getRepository(Order).findOne({
      where,
      relations: ['items', 'items.extras', 'items.removedIngredients'],
    });

    if (!order) RpcExceptionHelper.notFound('Order');
    return this.mapOrderResponse(order);
  }

  async findAll(paginationDto: OrdersPaginationDto) {
    const {
      status,
      organizationId,
      offset = 0,
      limit = 20,
      search,
      userId,
    } = paginationDto;

    const effectiveLimit = limit > 0 ? limit : 20;

    const baseQuery = this.dataSource
      .getRepository(Order)
      .createQueryBuilder('order')
      .where('order.organizationId = :organizationId', { organizationId });

    if (userId) {
      baseQuery.andWhere('order.userId = :userId', { userId });
    }

    if (status?.length) {
      baseQuery.andWhere('order.status IN (:...statuses)', { statuses: status });
    }

    if (search) {
      baseQuery.andWhere(
        '("order"."id"::text ILIKE :search OR "order"."customerName" ILIKE :search OR "order"."orderNumber"::text ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const totalItems = await baseQuery.getCount();

    const items = await baseQuery
      .clone()
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('items.extras', 'extras')
      .orderBy('order.createdAt', 'DESC')
      .skip(offset)
      .take(effectiveLimit)
      .getMany();

    return {
      items: items.map((order) => this.mapOrderListItem(order)),
      totalItems,
      totalPages: Math.ceil(totalItems / effectiveLimit),
      currentPage: Math.floor(offset / effectiveLimit) + 1,
      hasMore: offset + effectiveLimit < totalItems,
    };
  }

  async update(updateOrderDto: UpdateOrderDto) {
    const { id, organizationId, customerName, status, voidReason, voidReasonDetails } = updateOrderDto;
    const repo = this.dataSource.getRepository(Order);

    const order = await repo.findOne({ where: { id, organizationId } });
    if (!order) RpcExceptionHelper.notFound('Order');

    if (status && !this.validateStateTransition(order.status, status)) {
      RpcExceptionHelper.badRequestException(
        `Invalid status transition from ${order.status} to ${status}`,
      );
    }

    // TODO: before advancing a POS order out of PENDING, verify it has at
    // least one item. An empty order should not be closeable or payable.
    // Load the items relation here and call an assertOrderCloseable(order)
    // helper (similar to assertOrderEditable) when you're ready to enforce it.

    if (customerName !== undefined) order.customerName = customerName;
    if (status !== undefined) order.status = status;
    if (voidReason !== undefined) order.voidReason = voidReason;
    if (voidReasonDetails !== undefined) order.voidReasonDetails = voidReasonDetails;

    if (status === OrderStatus.CANCELLED) {
      const hadCompletedPayments = order.paymentStatus === PaymentStatus.PAID;

      if (hadCompletedPayments) {
        // TODO[CRITICAL][REFUND]: this only marks the status — it does NOT issue
        // the real Stripe refund. Before production with live Stripe payments,
        // this MUST trigger an actual refund (Stripe refund API for card
        // payments; manual cash handling for manual payments), or customers will
        // be marked refunded without getting their money back.
        order.paymentStatus = PaymentStatus.REFUNDED;
        this.logger.warn(
          `[REFUND-PENDING] Order ${order.id} cancelled with paymentStatus=PAID — ` +
          `set to REFUNDED but NO real refund was executed. ` +
          `A Stripe refund must be issued manually before going live.`,
        );
      } else {
        order.paymentStatus = PaymentStatus.CANCELLED;
      }
    }

    const saved = await repo.save(order);
    if (status === OrderStatus.CANCELLED) {
      this.paymentsEventsClient.emit(ORDER_PATTERNS.ORDER_CANCELLED, {
        orderId: saved.id,
        organizationId: saved.organizationId,
      });
    }

    return this.mapOrderResponse(saved);
  }

  // ===============================
  // ADD ITEM
  // ===============================
  async addItem(dto: AddOrderItemDto) {
    const { orderId, organizationId, item } = dto;
    const orderRepo = this.dataSource.getRepository(Order);
    const itemRepo = this.dataSource.getRepository(OrderItem);
    const extraRepo = this.dataSource.getRepository(OrderItemExtra);
    const removedRepo = this.dataSource.getRepository(OrderItemRemovedIngredient);

    const order = await orderRepo.findOne({
      where: { id: orderId, organizationId },
      relations: ['items', 'items.extras', 'items.removedIngredients'],
    });
    if (!order) RpcExceptionHelper.notFound('Order');

    this.assertOrderEditable(order);

    const extrasTotal = item.extras?.reduce((s, e) => s + e.price * e.quantity, 0) ?? 0;
    const itemTotal = (item.unitPrice + extrasTotal) * item.quantity;

    const orderItem = await itemRepo.save(
      itemRepo.create({
        organizationId,
        orderId: order.id,
        productId: item.productId,
        name: item.name,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        total: itemTotal,
      }),
    );

    if (item.extras?.length) {
      for (const extra of item.extras) {
        await extraRepo.save(
          extraRepo.create({
            organizationId,
            orderItemId: orderItem.id,
            extraId: extra.extraId,
            name: extra.name,
            price: extra.price,
            quantity: extra.quantity,
            total: extra.price * extra.quantity,
          }),
        );
      }
    }

    if (item.removedIngredients?.length) {
      for (const removed of item.removedIngredients) {
        await removedRepo.save(
          removedRepo.create({
            organizationId,
            orderItemId: orderItem.id,
            ingredientId: removed.ingredientId,
            ingredientName: removed.ingredientName,
          }),
        );
      }
    }

    const updatedOrder = await orderRepo.findOne({
      where: { id: order.id, organizationId },
      relations: ['items', 'items.extras', 'items.removedIngredients'],
    });
    if (!updatedOrder) RpcExceptionHelper.notFound('Order');

    const { subtotal, total } = this.recomputeOrderTotals(updatedOrder.items);
    updatedOrder.subtotal = subtotal;
    updatedOrder.total = total;
    await orderRepo.save(updatedOrder);

    return this.mapOrderResponse(updatedOrder);
  }

  // ===============================
  // REMOVE ITEM
  // ===============================
  async removeItem(dto: RemoveOrderItemDto) {
    const { orderId, itemId, organizationId } = dto;
    const orderRepo = this.dataSource.getRepository(Order);
    const itemRepo = this.dataSource.getRepository(OrderItem);

    const order = await orderRepo.findOne({
      where: { id: orderId, organizationId },
      relations: ['items', 'items.extras', 'items.removedIngredients'],
    });
    if (!order) RpcExceptionHelper.notFound('Order');

    const item = order.items.find((i) => i.id === itemId);
    if (!item) RpcExceptionHelper.notFound('OrderItem');

    this.assertOrderEditable(order);

    // onDelete: 'CASCADE' on the FK removes extras/removedIngredients at DB level
    await itemRepo.remove(item);

    const updatedOrder = await orderRepo.findOne({
      where: { id: order.id, organizationId },
      relations: ['items', 'items.extras', 'items.removedIngredients'],
    });
    if (!updatedOrder) RpcExceptionHelper.notFound('Order');

    const { subtotal, total } = this.recomputeOrderTotals(updatedOrder.items);
    updatedOrder.subtotal = subtotal;
    updatedOrder.total = total;
    await orderRepo.save(updatedOrder);

    return this.mapOrderResponse(updatedOrder);
  }

  // ===============================
  // UPDATE ORDER ITEM (quantity + extras + removedIngredients, all optional)
  // Each provided field fully replaces the existing value; omitted fields are
  // left untouched. extras/removedIngredients are replaced atomically via an
  // explicit DELETE + re-insert so the stored set always matches the request.
  // ===============================
  async updateOrderItem(dto: UpdateOrderItemDto) {
    const { orderId, itemId, organizationId, quantity, extras, removedIngredients } = dto;
    const orderRepo = this.dataSource.getRepository(Order);
    const itemRepo = this.dataSource.getRepository(OrderItem);
    const extraRepo = this.dataSource.getRepository(OrderItemExtra);
    const removedRepo = this.dataSource.getRepository(OrderItemRemovedIngredient);

    const order = await orderRepo.findOne({
      where: { id: orderId, organizationId },
      relations: ['items', 'items.extras', 'items.removedIngredients'],
    });
    if (!order) RpcExceptionHelper.notFound('Order');

    const item = order.items.find((i) => i.id === itemId);
    if (!item) RpcExceptionHelper.notFound('OrderItem');

    this.assertOrderEditable(order);

    // Replace extras only when the field was explicitly sent (including [])
    if (extras !== undefined) {
      await extraRepo.delete({ orderItemId: item.id });
      const newExtras: OrderItemExtra[] = [];
      for (const extra of extras) {
        newExtras.push(
          await extraRepo.save(
            extraRepo.create({
              organizationId,
              orderItemId: item.id,
              extraId: extra.extraId,
              name: extra.name,
              price: extra.price,
              quantity: extra.quantity,
              total: extra.price * extra.quantity,
            }),
          ),
        );
      }
      item.extras = newExtras;
    }

    // Replace removed ingredients only when the field was explicitly sent
    if (removedIngredients !== undefined) {
      await removedRepo.delete({ orderItemId: item.id });
      const newRemoved: OrderItemRemovedIngredient[] = [];
      for (const removed of removedIngredients) {
        newRemoved.push(
          await removedRepo.save(
            removedRepo.create({
              organizationId,
              orderItemId: item.id,
              ingredientId: removed.ingredientId,
              ingredientName: removed.ingredientName,
            }),
          ),
        );
      }
      item.removedIngredients = newRemoved;
    }

    if (quantity !== undefined) {
      item.quantity = quantity;
    }

    // Always recompute item.total from the current (possibly replaced) extras
    const extrasTotal = item.extras?.reduce((s, e) => s + Number(e.price) * e.quantity, 0) ?? 0;
    item.total = (Number(item.unitPrice) + extrasTotal) * item.quantity;
    await itemRepo.save(item);

    // Reload the full order so recomputeOrderTotals sees all fresh item.totals
    const updatedOrder = await orderRepo.findOne({
      where: { id: orderId, organizationId },
      relations: ['items', 'items.extras', 'items.removedIngredients'],
    });
    if (!updatedOrder) RpcExceptionHelper.notFound('Order');

    const { subtotal, total } = this.recomputeOrderTotals(updatedOrder.items);
    updatedOrder.subtotal = subtotal;
    updatedOrder.total = total;
    await orderRepo.save(updatedOrder);

    return this.mapOrderResponse(updatedOrder);
  }

  async updatePaymentStatus(
    id: string,
    paymentStatus: PaymentStatus,
    organizationId: string,
  ) {
    const repo = this.dataSource.getRepository(Order);
    const order = await repo.findOne({ where: { id, organizationId } });
    if (!order) RpcExceptionHelper.notFound('Order');
    order.paymentStatus = paymentStatus;
    return repo.save(order);
  }

  // ===============================
  // SEND NEW ITEMS TO KITCHEN (bulk: all NEW → SENT_TO_KITCHEN)
  // ===============================
  async sendToKitchen(dto: SendToKitchenDto) {
    const { orderId, organizationId } = dto;
    const orderRepo = this.dataSource.getRepository(Order);
    const itemRepo = this.dataSource.getRepository(OrderItem);

    const order = await orderRepo.findOne({
      where: { id: orderId, organizationId },
      relations: ['items', 'items.extras', 'items.removedIngredients'],
    });
    if (!order) RpcExceptionHelper.notFound('Order');

    const newItems = order.items.filter((i) => i.status === OrderItemStatus.NEW);
    if (!newItems.length) {
      RpcExceptionHelper.badRequestException('No NEW items to send to kitchen');
    }

    await itemRepo.update(
      newItems.map((i) => i.id),
      { status: OrderItemStatus.SENT_TO_KITCHEN },
    );

    // Reflect the update in the in-memory list so mapOrderResponse is accurate
    for (const item of order.items) {
      if (item.status === OrderItemStatus.NEW) {
        item.status = OrderItemStatus.SENT_TO_KITCHEN;
      }
    }

    return this.mapOrderResponse(order);
  }

  // ===============================
  // MARK SINGLE ITEM PREPARED (SENT_TO_KITCHEN → PREPARED)
  // ===============================
  async markItemPrepared(dto: MarkItemPreparedDto) {
    const { orderId, itemId, organizationId } = dto;
    const orderRepo = this.dataSource.getRepository(Order);
    const itemRepo = this.dataSource.getRepository(OrderItem);

    const order = await orderRepo.findOne({
      where: { id: orderId, organizationId },
      relations: ['items', 'items.extras', 'items.removedIngredients'],
    });
    if (!order) RpcExceptionHelper.notFound('Order');

    const item = order.items.find((i) => i.id === itemId);
    if (!item) RpcExceptionHelper.notFound('OrderItem');

    this.validateItemStatusTransition(item.status, OrderItemStatus.PREPARED);

    item.status = OrderItemStatus.PREPARED;
    await itemRepo.save(item);

    return this.mapOrderResponse(order);
  }

  // ===============================
  // CALCULATE TOTALS
  // ===============================
  private calculateTotals(items: CreateOrderItemDto[]) {
    let subtotal = 0;

    for (const item of items) {
      const extrasTotal =
        item.extras?.reduce(
          (sum, extra) => sum + extra.price * extra.quantity,
          0,
        ) ?? 0;

      subtotal += (item.unitPrice + extrasTotal) * item.quantity;
    }

    return { subtotal, total: subtotal };
  }

  // ===============================
  // GENERATE ORDER NUMBER (SEQUENTIAL PER ORGANIZATION)
  // ===============================
  async generateOrderNumber(organizationId: string, manager: EntityManager) {
    const lastOrder = await manager
      .createQueryBuilder(Order, 'order')
      .where('order.organizationId = :organizationId', { organizationId })
      .orderBy('order.orderNumber', 'DESC')
      .setLock('pessimistic_write')
      .getOne();

    return (lastOrder?.orderNumber ?? 0) + 1;
  }

  // ===============================
  // MAP FOR FRONTEND (UI)
  // ===============================
  private mapOrderListItem(order: Order) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      status: order.status,
      paymentStatus: order.paymentStatus,
      currency: order.currency,
      subtotal: Number(order.subtotal),
      total: Number(order.total),
      createdAt: order.createdAt,
      items: order.items.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        total: Number(item.total),
        extrasCount: item.extras?.length ?? 0,
      })),
    };
  }

  private mapOrderResponse(order: Order) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      status: order.status,
      voidReason: order.voidReason ?? null,
      voidReasonDetails: order.voidReasonDetails ?? null,
      paymentStatus: order.paymentStatus,
      currency: order.currency,
      subtotal: Number(order.subtotal),
      total: Number(order.total),
      createdAt: order.createdAt,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        total: Number(item.total),
        status: item.status,
        extras:
          item.extras?.map((extra) => ({
            id: extra.id,
            name: extra.name,
            quantity: extra.quantity,
            price: Number(extra.price),
            total: Number(extra.total),
          })) ?? [],
        removedIngredients:
          item.removedIngredients?.map((removed) => ({
            id: removed.id,
            name: removed.ingredientName,
          })) ?? [],
      })),
    };
  }

  // ===============================
  // MAP FOR STRIPE
  // ===============================
  async mapOrderToStripeLineItems(orderId: string, organizationId: string) {
    const order = await this.dataSource.getRepository(Order).findOne({
      where: { id: orderId, organizationId },
      relations: ['items', 'items.extras'],
    });

    if (!order) {
      RpcExceptionHelper.notFound('Order');
    }

    return {
      orderId: order.id,
      amount: Math.round(Number(order.total) * 100),
      lineItems: order.items.map((item) => {
        const extrasTotal =
          item.extras?.reduce(
            (sum, extra) => sum + Number(extra.price) * extra.quantity,
            0,
          ) ?? 0;

        const unitAmount = (Number(item.unitPrice) + extrasTotal) * 100;

        return {
          price_data: {
            currency: order.currency,
            product_data: {
              name: this.buildStripeItemName(item),
            },
            unit_amount: unitAmount,
          },
          quantity: item.quantity,
        };
      }),
    };
  }

  // ===============================
  // BUILD STRIPE ITEM NAME (INCLUDE EXTRAS)
  // ===============================
  private buildStripeItemName(item: OrderItem) {
    if (!item.extras?.length) return item.name;

    const extrasNames = item.extras.map((e) => e.name).join(', ');

    return `${item.name} (+ ${extrasNames})`;
  }

  // ================================
  // CUSTOMER ANONYMIZATION HANDLER
  // Nulls the denormalized customerName on all orders belonging to the given
  // userId. Called when auth-ms emits customer.anonymized.
  // Safe to call multiple times (UPDATE WHERE userId=X is a no-op once done).
  // ================================
  async anonymizeCustomerOrders(userId: string): Promise<void> {
    const result = await this.orderRepository.update(
      { userId },
      { customerName: null as any },
    );
    this.logger.log(
      `customer.anonymized: nulled customerName on ${result.affected ?? 0} order(s) for userId=${userId}`,
    );
  }

  // ================================
  // ITEM EDIT LIFECYCLE GUARD
  // Guard point for item-edit lifecycle rules. Called by addItem, removeItem,
  // and updateItemQuantity before any mutation.
  //
  // TODO: define when an order is locked — e.g. when paymentStatus==='PAID'
  // or status==='COMPLETED'/'CANCELLED'. Editing a paid order's items is an
  // accounting risk: the total already charged to the customer will no longer
  // match the stored order total, creating a discrepancy without a refund or
  // adjustment record. Uncomment the check below before going live.
  // ================================
  private assertOrderEditable(_order: Order): void {
    // if (
    //   _order.paymentStatus === PaymentStatus.PAID ||
    //   _order.status === OrderStatus.COMPLETED ||
    //   _order.status === OrderStatus.CANCELLED
    // ) {
    //   RpcExceptionHelper.badRequestException(
    //     'Cannot edit items on a locked order (paid, completed, or cancelled)',
    //   );
    // }
  }

  // ================================
  // RECOMPUTE ORDER TOTALS
  // Sums item.total across all items. item.total is kept as
  // (unitPrice + extrasTotal) * quantity at every write, so this is
  // authoritative and never trusts a client-sent value.
  // ================================
  private recomputeOrderTotals(items: OrderItem[]): { subtotal: number; total: number } {
    const subtotal = items.reduce((sum, item) => sum + Number(item.total), 0);
    return { subtotal, total: subtotal };
  }

  // ================================
  // VALIDATE ITEM STATUS TRANSITIONS
  // Legal: NEW→SENT_TO_KITCHEN, SENT_TO_KITCHEN→PREPARED
  // ================================
  private validateItemStatusTransition(from: OrderItemStatus, to: OrderItemStatus): void {
    const allowed: Record<OrderItemStatus, OrderItemStatus[]> = {
      [OrderItemStatus.NEW]: [OrderItemStatus.SENT_TO_KITCHEN],
      [OrderItemStatus.SENT_TO_KITCHEN]: [OrderItemStatus.PREPARED],
      [OrderItemStatus.PREPARED]: [],
    };

    if (!allowed[from]?.includes(to)) {
      RpcExceptionHelper.badRequestException(
        `Invalid item status transition from ${from} to ${to}`,
      );
    }
  }

  // ================================
  // VALIDATE STATUS TRANSITIONS
  // ================================
  private validateStateTransition(from: OrderStatus, to: OrderStatus): boolean {
    const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
      // PENDING allows direct COMPLETED for counter/direct-sale flows where no
      // preparation steps are needed. Kitchen flow (→IN_PROGRESS) still works.
      [OrderStatus.PENDING]: [OrderStatus.IN_PROGRESS, OrderStatus.COMPLETED, OrderStatus.CANCELLED],

      [OrderStatus.IN_PROGRESS]: [
        OrderStatus.READY,
        OrderStatus.COMPLETED,
        OrderStatus.CANCELLED,
      ],

      [OrderStatus.READY]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],

      [OrderStatus.COMPLETED]: [OrderStatus.REOPENED],
      // REOPENED stays [IN_PROGRESS, CANCELLED]: a reopened order implies
      // something needs correcting, so it must re-enter the workflow rather
      // than jumping straight to COMPLETED again.
      [OrderStatus.REOPENED]: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED],
      [OrderStatus.CANCELLED]: [],
    };

    return allowedTransitions[from]?.includes(to) ?? false;
  }
}
