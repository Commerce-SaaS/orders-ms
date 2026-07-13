import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderStatus } from 'src/common/enums/order-status.enum';
import { DataSource, EntityManager, FindOptionsWhere, In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderItemExtra } from './entities/order-item-extra.entity';
import { OrderItemRemovedIngredient } from './entities/order-item-removed-ingredient.entity';
import { OrderSlot } from './entities/order-slot.entity';
import { Table } from './entities/table.entity';
import { RpcExceptionHelper } from 'src/common/helpers/rpc-exception.helper';
import { FindOneByOrgDto } from 'src/common/dto/find-one-by-org.dto';
import { PaymentStatus } from 'src/common/enums/payment-status.enum';
import { OrdersPaginationDto } from 'src/common/dto/orders-pagination.dto';
import { CreateOrderItemDto } from './dto/create-order-item.dto';
import { AddOrderItemDto } from './dto/add-order-item.dto';
import { RemoveOrderItemDto } from './dto/remove-order-item.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';
import { CreatePosOrderDto } from './dto/create-pos-order.dto';
import { GetAvailableSlotsDto } from './dto/get-available-slots.dto';
import { OrderItemStatus } from 'src/common/enums/order-item-status.enum';
import { OrderType } from 'src/common/enums/order-type.enum';
import { TableStatus } from 'src/common/enums/table-status.enum';
import { SendToKitchenDto } from './dto/send-to-kitchen.dto';
import { MarkItemPreparedDto } from './dto/mark-item-prepared.dto';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { PAYMENTS_EVENTS_CLIENT, ORGANIZATION_SERVICE } from 'src/config/services';
import { ORDER_PATTERNS } from './patterns/order-patterns';
import { ORGANIZATION_PATTERNS } from './patterns/organization-patterns';

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

interface OpeningHoursRange {
  open: string; // HH:mm
  close: string; // HH:mm
}

type OpeningHours = Partial<Record<(typeof WEEKDAY_KEYS)[number], OpeningHoursRange[]>>;

interface SchedulingConfig {
  intervalMinutes: number;
  maxDishesPerSlot: number;
  openingHours: OpeningHours | null;
  timezone: string;
}

interface DishCountable {
  quantity: number;
  countsTowardKitchenCapacity?: boolean;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @Inject(PAYMENTS_EVENTS_CLIENT)
    private readonly paymentsEventsClient: ClientProxy,
    @Inject(ORGANIZATION_SERVICE)
    private readonly organizationClient: ClientProxy,
  ) { }

  // ===============================
  // CREATE ORDER
  // ===============================
  async create(createOrderDto: CreateOrderDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { items, userId, status, organizationId, customerName, scheduledFor } =
        createOrderDto;

      this.logger.log(
        `[ORDER-FLOW] create: start userId=${userId} organizationId=${organizationId} itemCount=${items?.length ?? 0}`,
      );

      const { subtotal, total } = this.calculateTotals(items);

      this.logger.log(
        `[ORDER-FLOW] create: totals calculated subtotal=${subtotal} total=${total} — generating orderNumber`,
      );

      if (scheduledFor) {
        const config = await this.getOrgSchedulingConfig(organizationId);
        this.validateScheduledFor(scheduledFor, config);
        const dishesRequested = this.countDishes(items);
        if (dishesRequested > 0) {
          await this.reserveSlotCapacity(
            queryRunner.manager,
            organizationId,
            scheduledFor,
            dishesRequested,
            config.maxDishesPerSlot,
          );
        }
      }

      const order = queryRunner.manager.create(Order, {
        organizationId,
        userId,
        status: status ?? OrderStatus.PENDING,
        subtotal,
        total,
        customerName,
        scheduledFor: scheduledFor ?? null,
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
          countsTowardKitchenCapacity: item.countsTowardKitchenCapacity ?? true,
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
  // For DINE_IN orders with a tableId, the table row is locked (SELECT FOR UPDATE)
  // and marked OCCUPIED atomically within the same transaction. If the table is
  // already OCCUPIED this throws 409 before any insert happens.
  // ===============================
  async createPosOrder(dto: CreatePosOrderDto) {
    const {
      organizationId,
      customerId,
      customerName,
      customerPhone,
      customerAddress,
      customerEmail,
      orderType = OrderType.TAKEAWAY,
      tableId,
      partySize,
      scheduledFor,
    } = dto;

    if (orderType === OrderType.DINE_IN && !tableId) {
      RpcExceptionHelper.badRequestException('tableId is required for DINE_IN orders');
    }

    if (orderType === OrderType.DINE_IN && scheduledFor) {
      RpcExceptionHelper.badRequestException('DINE_IN orders cannot be scheduled');
    }

    if (scheduledFor) {
      const config = await this.getOrgSchedulingConfig(organizationId);
      this.validateScheduledFor(scheduledFor, config);
      // No items yet on POS orders — capacity is reserved as items are added
      // via addItem(), which locks/creates this order's OrderSlot then.
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (orderType === OrderType.DINE_IN) {
        const table = await queryRunner.manager
          .createQueryBuilder(Table, 'table')
          .where('table.id = :tableId AND table.organizationId = :organizationId', {
            tableId,
            organizationId,
          })
          .setLock('pessimistic_write')
          .getOne();

        if (!table) RpcExceptionHelper.notFound('Table');
        if (table.isDeleted) RpcExceptionHelper.notFound('Table');
        if (table.status !== TableStatus.FREE) {
          RpcExceptionHelper.conflict('Table is already occupied');
        }

        const order = queryRunner.manager.create(Order, {
          organizationId,
          customerId,
          customerName,
          customerPhone,
          customerAddress,
          customerEmail,
          orderType,
          tableId,
          partySize,
          status: OrderStatus.PENDING,
          paymentStatus: PaymentStatus.PENDING,
          subtotal: 0,
          total: 0,
          scheduledFor: scheduledFor ?? null,
          orderNumber: await this.generateOrderNumber(organizationId, queryRunner.manager),
        });

        await queryRunner.manager.save(order);

        table.status = TableStatus.OCCUPIED;
        table.currentOrderId = order.id;
        await queryRunner.manager.save(table);

        await queryRunner.commitTransaction();

        const loaded = await this.dataSource.getRepository(Order).findOne({
          where: { id: order.id, organizationId },
          relations: ['items', 'items.extras', 'items.removedIngredients'],
        });
        if (!loaded) RpcExceptionHelper.notFound('Order');
        return this.mapOrderResponse(loaded);
      }

      // Non-DINE_IN path
      const order = queryRunner.manager.create(Order, {
        organizationId,
        customerId,
        customerName,
        customerPhone,
        customerAddress,
        customerEmail,
        orderType,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        subtotal: 0,
        total: 0,
        scheduledFor: scheduledFor ?? null,
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
    const {
      id,
      organizationId,
      customerId,
      customerName,
      customerPhone,
      customerAddress,
      customerEmail,
      status,
      voidReason,
      voidReasonDetails,
      scheduledFor,
    } = updateOrderDto;

    const order = await this.dataSource.getRepository(Order).findOne({
      where: { id, organizationId },
      relations: ['items'],
    });
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

    const isTerminalStatus =
      status === OrderStatus.COMPLETED || status === OrderStatus.CANCELLED;
    const shouldReleaseTable = isTerminalStatus && !!order.tableId;

    // Resolve the target schedule before opening the transaction:
    // undefined = leave unchanged, null = unschedule, Date = reschedule.
    // Cancelling always unschedules (frees the slot) regardless of what the
    // caller sent for scheduledFor.
    let targetScheduledFor: Date | null;
    if (status === OrderStatus.CANCELLED) {
      targetScheduledFor = null;
    } else if (scheduledFor !== undefined) {
      targetScheduledFor = scheduledFor;
    } else {
      targetScheduledFor = order.scheduledFor ?? null;
    }
    const scheduleChanged =
      (targetScheduledFor?.getTime() ?? null) !== (order.scheduledFor?.getTime() ?? null);

    const config = scheduleChanged ? await this.getOrgSchedulingConfig(organizationId) : null;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (customerId !== undefined) order.customerId = customerId;
      if (customerName !== undefined) order.customerName = customerName;
      if (customerPhone !== undefined) order.customerPhone = customerPhone;
      if (customerAddress !== undefined) order.customerAddress = customerAddress;
      if (customerEmail !== undefined) order.customerEmail = customerEmail;
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

      if (scheduleChanged) {
        await this.applyScheduleChange(
          queryRunner.manager,
          organizationId,
          order,
          targetScheduledFor,
          config,
        );
        order.scheduledFor = targetScheduledFor;
      }

      const saved = await queryRunner.manager.save(Order, order);

      if (shouldReleaseTable) {
        await queryRunner.manager.update(
          Table,
          { currentOrderId: saved.id, organizationId },
          { status: TableStatus.FREE, currentOrderId: null as any },
        );
      }

      await queryRunner.commitTransaction();

      if (status === OrderStatus.CANCELLED) {
        this.paymentsEventsClient.emit(ORDER_PATTERNS.ORDER_CANCELLED, {
          orderId: saved.id,
          organizationId: saved.organizationId,
        });
      }

      return this.mapOrderResponse(saved);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ===============================
  // ADD ITEM
  // ===============================
  async addItem(dto: AddOrderItemDto) {
    const { orderId, organizationId, item } = dto;

    const orderRepo = this.dataSource.getRepository(Order);
    const order = await orderRepo.findOne({
      where: { id: orderId, organizationId },
      relations: ['items', 'items.extras', 'items.removedIngredients'],
    });
    if (!order) RpcExceptionHelper.notFound('Order');

    this.assertOrderEditable(order);

    const countsTowardKitchenCapacity = item.countsTowardKitchenCapacity ?? true;
    const dishesToAdd =
      order.scheduledFor && countsTowardKitchenCapacity ? item.quantity : 0;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (dishesToAdd > 0) {
        const config = await this.getOrgSchedulingConfig(organizationId);
        await this.reserveSlotCapacity(
          queryRunner.manager,
          organizationId,
          order.scheduledFor!,
          dishesToAdd,
          config.maxDishesPerSlot,
        );
      }

      const extrasTotal = item.extras?.reduce((s, e) => s + e.price * e.quantity, 0) ?? 0;
      const itemTotal = (item.unitPrice + extrasTotal) * item.quantity;

      const orderItem = queryRunner.manager.create(OrderItem, {
        organizationId,
        orderId: order.id,
        productId: item.productId,
        name: item.name,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        countsTowardKitchenCapacity,
        total: itemTotal,
      });
      await queryRunner.manager.save(orderItem);

      if (item.extras?.length) {
        for (const extra of item.extras) {
          await queryRunner.manager.save(
            queryRunner.manager.create(OrderItemExtra, {
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
          await queryRunner.manager.save(
            queryRunner.manager.create(OrderItemRemovedIngredient, {
              organizationId,
              orderItemId: orderItem.id,
              ingredientId: removed.ingredientId,
              ingredientName: removed.ingredientName,
            }),
          );
        }
      }

      const updatedOrder = await queryRunner.manager.findOne(Order, {
        where: { id: order.id, organizationId },
        relations: ['items', 'items.extras', 'items.removedIngredients'],
      });
      if (!updatedOrder) RpcExceptionHelper.notFound('Order');

      const { subtotal, total } = this.recomputeOrderTotals(updatedOrder.items);
      updatedOrder.subtotal = subtotal;
      updatedOrder.total = total;
      await queryRunner.manager.save(updatedOrder);

      await queryRunner.commitTransaction();
      return this.mapOrderResponse(updatedOrder);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ===============================
  // REMOVE ITEM
  // ===============================
  async removeItem(dto: RemoveOrderItemDto) {
    const { orderId, itemId, organizationId } = dto;
    const orderRepo = this.dataSource.getRepository(Order);

    const order = await orderRepo.findOne({
      where: { id: orderId, organizationId },
      relations: ['items', 'items.extras', 'items.removedIngredients'],
    });
    if (!order) RpcExceptionHelper.notFound('Order');

    const item = order.items.find((i) => i.id === itemId);
    if (!item) RpcExceptionHelper.notFound('OrderItem');

    this.assertOrderEditable(order);

    const dishesToRelease =
      order.scheduledFor && item.countsTowardKitchenCapacity ? item.quantity : 0;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (dishesToRelease > 0) {
        await this.releaseSlotCapacity(
          queryRunner.manager,
          organizationId,
          order.scheduledFor!,
          dishesToRelease,
        );
      }

      // onDelete: 'CASCADE' on the FK removes extras/removedIngredients at DB level
      await queryRunner.manager.remove(OrderItem, item);

      const updatedOrder = await queryRunner.manager.findOne(Order, {
        where: { id: order.id, organizationId },
        relations: ['items', 'items.extras', 'items.removedIngredients'],
      });
      if (!updatedOrder) RpcExceptionHelper.notFound('Order');

      const { subtotal, total } = this.recomputeOrderTotals(updatedOrder.items);
      updatedOrder.subtotal = subtotal;
      updatedOrder.total = total;
      await queryRunner.manager.save(updatedOrder);

      await queryRunner.commitTransaction();
      return this.mapOrderResponse(updatedOrder);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
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

    const order = await orderRepo.findOne({
      where: { id: orderId, organizationId },
      relations: ['items', 'items.extras', 'items.removedIngredients'],
    });
    if (!order) RpcExceptionHelper.notFound('Order');

    const item = order.items.find((i) => i.id === itemId);
    if (!item) RpcExceptionHelper.notFound('OrderItem');

    this.assertOrderEditable(order);

    const quantityDelta =
      quantity !== undefined && item.countsTowardKitchenCapacity
        ? quantity - item.quantity
        : 0;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (order.scheduledFor && quantityDelta !== 0) {
        if (quantityDelta > 0) {
          const config = await this.getOrgSchedulingConfig(organizationId);
          await this.reserveSlotCapacity(
            queryRunner.manager,
            organizationId,
            order.scheduledFor,
            quantityDelta,
            config.maxDishesPerSlot,
          );
        } else {
          await this.releaseSlotCapacity(
            queryRunner.manager,
            organizationId,
            order.scheduledFor,
            -quantityDelta,
          );
        }
      }

      // Replace extras only when the field was explicitly sent (including [])
      if (extras !== undefined) {
        await queryRunner.manager.delete(OrderItemExtra, { orderItemId: item.id });
        const newExtras: OrderItemExtra[] = [];
        for (const extra of extras) {
          newExtras.push(
            await queryRunner.manager.save(
              queryRunner.manager.create(OrderItemExtra, {
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
        await queryRunner.manager.delete(OrderItemRemovedIngredient, { orderItemId: item.id });
        const newRemoved: OrderItemRemovedIngredient[] = [];
        for (const removed of removedIngredients) {
          newRemoved.push(
            await queryRunner.manager.save(
              queryRunner.manager.create(OrderItemRemovedIngredient, {
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
      await queryRunner.manager.save(item);

      // Reload the full order so recomputeOrderTotals sees all fresh item.totals
      const updatedOrder = await queryRunner.manager.findOne(Order, {
        where: { id: orderId, organizationId },
        relations: ['items', 'items.extras', 'items.removedIngredients'],
      });
      if (!updatedOrder) RpcExceptionHelper.notFound('Order');

      const { subtotal, total } = this.recomputeOrderTotals(updatedOrder.items);
      updatedOrder.subtotal = subtotal;
      updatedOrder.total = total;
      await queryRunner.manager.save(updatedOrder);

      await queryRunner.commitTransaction();
      return this.mapOrderResponse(updatedOrder);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
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
      orderType: order.orderType,
      tableId: order.tableId ?? null,
      partySize: order.partySize ?? null,
      customerId: order.customerId ?? null,
      customerName: order.customerName,
      customerPhone: order.customerPhone ?? null,
      customerAddress: order.customerAddress ?? null,
      customerEmail: order.customerEmail ?? null,
      status: order.status,
      paymentStatus: order.paymentStatus,
      currency: order.currency,
      subtotal: Number(order.subtotal),
      total: Number(order.total),
      scheduledFor: order.scheduledFor ?? null,
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
      orderType: order.orderType,
      tableId: order.tableId ?? null,
      partySize: order.partySize ?? null,
      orderSource: order.orderSource ?? null,
      customerId: order.customerId ?? null,
      customerName: order.customerName,
      customerPhone: order.customerPhone ?? null,
      customerAddress: order.customerAddress ?? null,
      customerEmail: order.customerEmail ?? null,
      status: order.status,
      voidReason: order.voidReason ?? null,
      voidReasonDetails: order.voidReasonDetails ?? null,
      paymentStatus: order.paymentStatus,
      currency: order.currency,
      subtotal: Number(order.subtotal),
      total: Number(order.total),
      scheduledFor: order.scheduledFor ?? null,
      createdAt: order.createdAt,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        total: Number(item.total),
        status: item.status,
        countsTowardKitchenCapacity: item.countsTowardKitchenCapacity,
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
        OrderStatus.PENDING
      ],

      [OrderStatus.READY]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],

      [OrderStatus.COMPLETED]: [OrderStatus.REOPENED],
      // REOPENED stays [IN_PROGRESS, CANCELLED]: a reopened order implies
      // something needs correcting, so it must re-enter the workflow rather
      // than jumping straight to COMPLETED again.
      [OrderStatus.REOPENED]: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED, OrderStatus.COMPLETED,],
      [OrderStatus.CANCELLED]: [OrderStatus.REOPENED],
    };

    return allowedTransitions[from]?.includes(to) ?? false;
  }

  // ================================================================
  // SCHEDULED ORDERS
  // ================================================================

  // ===============================
  // AVAILABLE SLOTS
  // ===============================
  async getAvailableSlots(dto: GetAvailableSlotsDto) {
    const { organizationId, date } = dto;
    const config = await this.getOrgSchedulingConfig(organizationId);

    this.assertDateOnlyFormat(date);
    const dayKey = WEEKDAY_KEYS[dayjs.tz(date, 'YYYY-MM-DD', config.timezone).day()];
    const ranges = config.openingHours
      ? (config.openingHours[dayKey] ?? [])
      : [{ open: '00:00', close: '23:59' }];

    const now = new Date();
    const slotTimes = this.generateSlotTimes(
      date,
      ranges,
      config.intervalMinutes,
      config.timezone,
    ).filter((t) => t.getTime() > now.getTime());

    if (!slotTimes.length) return { date, slots: [] };

    const bookedRows = await this.dataSource.getRepository(OrderSlot).find({
      where: { organizationId, scheduledFor: In(slotTimes) },
    });
    const bookedMap = new Map(bookedRows.map((r) => [r.scheduledFor.getTime(), r.dishesBooked]));

    return {
      date,
      slots: slotTimes.map((time) => {
        const dishesBooked = bookedMap.get(time.getTime()) ?? 0;
        const remainingCapacity = Math.max(0, config.maxDishesPerSlot - dishesBooked);
        return {
          time: time.toISOString(),
          remainingCapacity,
          isFull: remainingCapacity <= 0,
        };
      }),
    };
  }

  // ===============================
  // ORG SCHEDULING CONFIG (request/response into organization-ms)
  // ===============================
  private async getOrgSchedulingConfig(organizationId: string): Promise<SchedulingConfig> {
    const organization = await firstValueFrom(
      this.organizationClient.send<any>(ORGANIZATION_PATTERNS.FIND_ONE, { id: organizationId }),
    );
    if (!organization) RpcExceptionHelper.notFound('Organization');

    return {
      intervalMinutes: organization.orderSchedulingIntervalMinutes ?? 15,
      maxDishesPerSlot: organization.maxDishesPerSlot ?? 20,
      openingHours: organization.openingHours ?? null,
      timezone: organization.timezone ?? 'UTC',
    };
  }

  // ===============================
  // VALIDATE scheduledFor: must be a future instant that lands exactly on a
  // slot boundary for the configured interval, and (if openingHours is set)
  // fall inside one of that weekday's ranges.
  // ===============================
  private validateScheduledFor(scheduledFor: Date, config: SchedulingConfig): void {
    const now = new Date();
    if (scheduledFor.getTime() <= now.getTime()) {
      RpcExceptionHelper.badRequestException('scheduledFor must be in the future');
    }

    // All alignment/opening-hours checks below are done in the organization's
    // local timezone, since that's the zone "HH:mm" opening-hour values (and
    // the intervalMinutes boundary the client picks from) are meant in.
    const local = dayjs(scheduledFor).tz(config.timezone);

    const alignsToInterval =
      local.second() === 0 &&
      local.millisecond() === 0 &&
      local.minute() % config.intervalMinutes === 0;
    if (!alignsToInterval) {
      RpcExceptionHelper.badRequestException(
        `scheduledFor must align to a ${config.intervalMinutes}-minute slot`,
      );
    }

    if (config.openingHours) {
      const dayKey = WEEKDAY_KEYS[local.day()];
      const ranges = config.openingHours[dayKey] ?? [];
      const localTime = local.format('HH:mm');
      const withinRange = ranges.some(
        (range) => localTime >= range.open && localTime < range.close,
      );
      if (!withinRange) {
        RpcExceptionHelper.badRequestException('scheduledFor falls outside organization opening hours');
      }
    }
  }

  // ===============================
  // COUNT DISHES (items that count toward kitchen capacity)
  // ===============================
  private countDishes(items: DishCountable[]): number {
    return items.reduce(
      (sum, item) => (item.countsTowardKitchenCapacity === false ? sum : sum + item.quantity),
      0,
    );
  }

  // ===============================
  // LOCK OR CREATE ORDER SLOT
  // INSERT ... ON CONFLICT DO NOTHING avoids the need for a savepoint around
  // a possible duplicate-key error inside the surrounding transaction — the
  // insert is a no-op if a concurrent transaction already created the row.
  // The subsequent SELECT ... FOR UPDATE (mirrors Table locking in
  // createPosOrder) is what actually serializes concurrent bookings.
  // ===============================
  private async lockSlot(
    manager: EntityManager,
    organizationId: string,
    scheduledFor: Date,
  ): Promise<OrderSlot> {
    await manager.query(
      `INSERT INTO order_slots (id, "organizationId", "scheduledFor", "dishesBooked", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, 0, now(), now())
       ON CONFLICT ("organizationId", "scheduledFor") DO NOTHING`,
      [organizationId, scheduledFor],
    );

    const slot = await manager
      .createQueryBuilder(OrderSlot, 'slot')
      .where('slot.organizationId = :organizationId AND slot.scheduledFor = :scheduledFor', {
        organizationId,
        scheduledFor,
      })
      .setLock('pessimistic_write')
      .getOne();

    if (!slot) RpcExceptionHelper.internalServerError('Failed to acquire order slot lock');
    return slot;
  }

  // ===============================
  // RESERVE SLOT CAPACITY (atomic — call within an open transaction)
  // ===============================
  private async reserveSlotCapacity(
    manager: EntityManager,
    organizationId: string,
    scheduledFor: Date,
    dishesRequested: number,
    maxDishesPerSlot: number,
  ): Promise<void> {
    if (dishesRequested <= 0) return;

    const slot = await this.lockSlot(manager, organizationId, scheduledFor);

    if (slot.dishesBooked + dishesRequested > maxDishesPerSlot) {
      RpcExceptionHelper.conflictWithCode(
        'SLOT_CAPACITY_EXCEEDED',
        `Selected time slot no longer has capacity (${slot.dishesBooked}/${maxDishesPerSlot} dishes booked)`,
      );
    }

    slot.dishesBooked += dishesRequested;
    await manager.save(slot);
  }

  // ===============================
  // RELEASE SLOT CAPACITY (atomic — call within an open transaction)
  // ===============================
  private async releaseSlotCapacity(
    manager: EntityManager,
    organizationId: string,
    scheduledFor: Date,
    dishesToRelease: number,
  ): Promise<void> {
    if (dishesToRelease <= 0) return;

    const slot = await manager
      .createQueryBuilder(OrderSlot, 'slot')
      .where('slot.organizationId = :organizationId AND slot.scheduledFor = :scheduledFor', {
        organizationId,
        scheduledFor,
      })
      .setLock('pessimistic_write')
      .getOne();

    if (!slot) {
      this.logger.warn(
        `releaseSlotCapacity: no OrderSlot found for organizationId=${organizationId} scheduledFor=${scheduledFor.toISOString()} — nothing to release`,
      );
      return;
    }

    slot.dishesBooked = Math.max(0, slot.dishesBooked - dishesToRelease);
    await manager.save(slot);
  }

  // ===============================
  // APPLY SCHEDULE CHANGE (reschedule/unschedule an existing order)
  // Locks the old and new slots in ascending time order so two orders
  // swapping slots concurrently can't deadlock against each other.
  // ===============================
  private async applyScheduleChange(
    manager: EntityManager,
    organizationId: string,
    order: Order,
    newScheduledFor: Date | null,
    config: SchedulingConfig | null,
  ): Promise<void> {
    const dishesForOrder = this.countDishes(order.items ?? []);
    const oldScheduledFor = order.scheduledFor ?? null;

    if (newScheduledFor && config) {
      this.validateScheduledFor(newScheduledFor, config);
    }

    const steps: Array<{ time: Date; kind: 'release' | 'reserve' }> = [];
    if (oldScheduledFor) steps.push({ time: oldScheduledFor, kind: 'release' });
    if (newScheduledFor) steps.push({ time: newScheduledFor, kind: 'reserve' });
    steps.sort((a, b) => a.time.getTime() - b.time.getTime());

    if (dishesForOrder <= 0) return;

    for (const step of steps) {
      if (step.kind === 'release') {
        await this.releaseSlotCapacity(manager, organizationId, step.time, dishesForOrder);
      } else if (config) {
        await this.reserveSlotCapacity(
          manager,
          organizationId,
          step.time,
          dishesForOrder,
          config.maxDishesPerSlot,
        );
      }
    }
  }

  // ===============================
  // DATE / SLOT GENERATION HELPERS
  // ===============================
  private assertDateOnlyFormat(date: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      RpcExceptionHelper.badRequestException('date must be in YYYY-MM-DD format');
    }
  }

  // Builds each slot as `${date} ${HH:mm}` interpreted in the organization's
  // timezone, so the returned instants are correct regardless of the
  // server's own local/UTC clock.
  private generateSlotTimes(
    date: string,
    ranges: OpeningHoursRange[],
    intervalMinutes: number,
    timezone: string,
  ): Date[] {
    const slots: Date[] = [];
    for (const range of ranges) {
      let cursor = dayjs.tz(`${date} ${range.open}`, 'YYYY-MM-DD HH:mm', timezone);
      const end = dayjs.tz(`${date} ${range.close}`, 'YYYY-MM-DD HH:mm', timezone);

      while (cursor.isBefore(end)) {
        slots.push(cursor.toDate());
        cursor = cursor.add(intervalMinutes, 'minute');
      }
    }
    return slots;
  }
}
