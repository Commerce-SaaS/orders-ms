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

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
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
