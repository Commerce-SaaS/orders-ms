import { Order } from 'src/orders/entities/order.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { OrderItemRemovedIngredient } from './order-item-removed-ingredient.entity';
import { OrderItemExtra } from './order-item-extra.entity';
import { OrderItemStatus } from 'src/common/enums/order-item-status.enum';

@Entity('order_items')
@Index(['orderId', 'organizationId'])
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  // 📦 Snapshot del producto
  @Column({ type: 'uuid' })
  productId: string;

  @Column({ length: 150 })
  name: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: {
      from: (v: string) => parseFloat(v),
      to: (v: number) => v,
    },
  })
  unitPrice: number;

  @Column({ type: 'int' })
  quantity: number;

  // Snapshot of the product's category flag at order time — see
  // Category.countsTowardKitchenCapacity in product-ms. Drives how many
  // "dishes" this item occupies against its OrderSlot's capacity.
  @Column({ type: 'boolean', default: true })
  countsTowardKitchenCapacity: boolean;

  @Column({
    type: 'enum',
    enum: OrderItemStatus,
    default: OrderItemStatus.NEW,
  })
  status: OrderItemStatus;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: {
      from: (v: string) => parseFloat(v),
      to: (v: number) => v,
    },
  })
  total: number;

  // 🔥 Extras
  @OneToMany(() => OrderItemExtra, (extra) => extra.orderItem, {
    cascade: true,
    eager: true,
    orphanedRowAction: 'delete',
  })
  extras: OrderItemExtra[];

  // 🔥 Removed ingredients
  @OneToMany(() => OrderItemRemovedIngredient, (removed) => removed.orderItem, {
    eager: true,
    cascade: true,
    orphanedRowAction: 'delete',
  })
  removedIngredients: OrderItemRemovedIngredient[];

  @CreateDateColumn()
  createdAt: Date;
}

// PROD MIGRATION NOTE (TypeORM synchronize handles dev automatically; do NOT
// run synchronize in production):
//   ALTER TABLE order_items ADD COLUMN "countsTowardKitchenCapacity" boolean NOT NULL DEFAULT true;
