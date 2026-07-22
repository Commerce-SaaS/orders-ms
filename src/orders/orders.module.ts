import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from 'src/orders/entities/order-item.entity';
import { OrderItemExtra } from 'src/orders/entities/order-item-extra.entity';
import { OrderItemRemovedIngredient } from './entities/order-item-removed-ingredient.entity';
import { OrderSlot } from './entities/order-slot.entity';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      OrderItemExtra,
      OrderItemRemovedIngredient,
      OrderSlot,
    ]),
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
