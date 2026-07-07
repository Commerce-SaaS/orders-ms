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
import { PaymentStatus } from 'src/common/enums/payment-status.enum';
import { VoidReason } from 'src/common/enums/void-reason.enum';

export { VoidReason };

@Entity('orders')
@Index(['organizationId', 'createdAt'])
@Index(['organizationId', 'status'])
@Index(['userId'])
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  customerName?: string;

  @Column({ type: 'int' })
  orderNumber: number;

  @Column({ type: 'uuid' })
  organizationId!: string;

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
    enum: VoidReason,
    nullable: true,
    default: null,
  })
  voidReason?: VoidReason | null;

  @Column({
    type: 'text',
    nullable: true,
    default: null,
  })
  voidReasonDetails?: string | null;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  paymentStatus: PaymentStatus;

  @Column({
    type: 'enum',
    enum: OrderCurrency,
    default: OrderCurrency.EUR,
  })
  currency: OrderCurrency;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: {
      from: (v: string) => parseFloat(v),
      to: (v: number) => v,
    },
  })
  subtotal: number;

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
