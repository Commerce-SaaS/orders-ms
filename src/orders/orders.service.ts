import { Injectable, Logger } from '@nestjs/common';
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

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
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
    const { id } = updateOrderDto;
    const repo = this.dataSource.getRepository(Order);

    const order = await repo.findOne({
      where: { id, organizationId: updateOrderDto.organizationId },
    });

    if (!order) {
      RpcExceptionHelper.notFound('Order');
    }

    if (
      updateOrderDto.status &&
      !this.validateStateTransition(
        order.status,
        updateOrderDto.status as OrderStatus,
      )
    ) {
      RpcExceptionHelper.badRequestException(
        `Invalid status transition from ${order.status} to ${updateOrderDto.status}`,
      );
    }

    repo.merge(order, updateOrderDto);

    return repo.save(order);
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
  // VALIDATE STATUS TRANSITIONS
  // ================================
  private validateStateTransition(from: OrderStatus, to: OrderStatus): boolean {
    const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED],

      [OrderStatus.IN_PROGRESS]: [
        OrderStatus.READY,
        OrderStatus.COMPLETED,
        OrderStatus.CANCELLED,
      ],

      [OrderStatus.READY]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],

      [OrderStatus.COMPLETED]: [OrderStatus.REOPENED],
      [OrderStatus.REOPENED]: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED],
      [OrderStatus.CANCELLED]: [],
    };

    return allowedTransitions[from]?.includes(to) ?? false;
  }
}
