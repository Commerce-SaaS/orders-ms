import { Injectable } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderStatus } from 'src/common/enums/order-status.enum';
import { DataSource } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderItemExtra } from './entities/order-item-extra.entity';
import { OrderItemRemovedIngredient } from './entities/order-item-removed-ingredient.entity';
import { RpcExceptionHelper } from 'src/common/helpers/rpc-exception.helper';
import { FindOneByOrgDto } from 'src/common/dto/find-one-by-org.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly dataSource: DataSource) {}

  // ===============================
  // CREATE ORDER
  // ===============================
  async create(createOrderDto: CreateOrderDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { items, userId, status, organizationId } = createOrderDto;

      const { subtotal, total } = this.calculateTotals(items);

      const order = queryRunner.manager.create(Order, {
        organizationId,
        userId,
        status: status ?? OrderStatus.PENDING,
        subtotal,
        total,
      });

      await queryRunner.manager.save(order);

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

      return this.mapOrderToStripeLineItems(order.id, organizationId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ===============================
  // FIND ORDER (UI STRUCTURE)
  // ===============================
  async findOne(dto: FindOneByOrgDto) {
    const order = await this.dataSource.getRepository(Order).findOne({
      where: { id: dto.id, organizationId: dto.organizationId },
      relations: ['items', 'items.extras', 'items.removedIngredients'],
    });

    if (!order) {
      RpcExceptionHelper.notFound('Order');
    }

    return this.mapOrderResponse(order);
  }

  // ===============================
  // CALCULATE TOTALS
  // ===============================
  private calculateTotals(items: any[]) {
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
  // MAP FOR FRONTEND (UI)
  // ===============================
  private mapOrderResponse(order: Order) {
    return {
      id: order.id,
      status: order.status,
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
      amount: Number(order.total * 100),
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

  private buildStripeItemName(item: OrderItem) {
    if (!item.extras?.length) return item.name;

    const extrasNames = item.extras.map((e) => e.name).join(', ');

    return `${item.name} (+ ${extrasNames})`;
  }

  // async findAll() {
  //   return this.dataSource.getRepository(Order).find({
  //     relations: {
  //       // solo si luego agregas relación inversa
  //     },
  //     order: { createdAt: 'DESC' },
  //   });
  // }

  // async update(id: string, updateOrderDto: UpdateOrderDto) {
  //   const repo = this.dataSource.getRepository(Order);

  //   const order = await repo.findOne({ where: { id } });

  //   if (!order) {
  //     RpcExceptionHelper.notFound('Order');
  //   }

  //   if (
  //     updateOrderDto.status &&
  //     !this.validateStateTransition(order.status, updateOrderDto.status)
  //   ) {
  //     RpcExceptionHelper.badRequestException(
  //       `Invalid status transition from ${order.status} to ${updateOrderDto.status}`,
  //     );
  //   }

  //   repo.merge(order, updateOrderDto);

  //   return repo.save(order);
  // }

  // async cancel(id: string) {
  //   const repo = this.dataSource.getRepository(Order);

  //   const order = await repo.findOne({ where: { id } });

  //   if (!order) {
  //     RpcExceptionHelper.notFound('Order');
  //   }

  //   if (order.status === OrderStatus.CANCELLED) {
  //     return order;
  //   }

  //   order.status = OrderStatus.CANCELLED;

  //   return repo.save(order);
  // }

  // private validateStateTransition(from: OrderStatus, to: OrderStatus): boolean {
  //   const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
  //     [OrderStatus.PENDING]: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED],
  //     [OrderStatus.IN_PROGRESS]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  //     [OrderStatus.COMPLETED]: [],
  //     [OrderStatus.CANCELLED]: [],
  //   };

  //   return allowedTransitions[from]?.includes(to);
  // }
}
