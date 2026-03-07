import { OrderStatus } from 'src/common/enums/order-status.enum';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { OrderItem } from './order-item.entity';
import { OrderCurrency } from 'src/common/enums/order-currency.enum';

@Entity('orders')
@Index(['organizationId', 'createdAt'])
@Index(['organizationId', 'status'])
@Index(['userId'])
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid', nullable: true })
  userId?: string;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Column({
    type: 'enum',
    enum: OrderCurrency,
    default: OrderCurrency.EUR,
  })
  currency: OrderCurrency;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total: number;

  // 🔥 Aggregate root relation
  @OneToMany(() => OrderItem, (item) => item.order, {
    eager: true,
    cascade: true,
    orphanedRowAction: 'delete',
  })
  items: OrderItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
