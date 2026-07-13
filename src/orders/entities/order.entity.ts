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
import { OrderType } from 'src/common/enums/order-type.enum';

export { VoidReason };

@Entity('orders')
@Index(['organizationId', 'createdAt'])
@Index(['organizationId', 'status'])
@Index(['userId'])
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  customerId?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  customerName?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  customerPhone?: string;

  @Column({ type: 'text', nullable: true })
  customerAddress?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  customerEmail?: string;

  @Column({ type: 'int' })
  orderNumber: number;

  @Column({ type: 'uuid' })
  organizationId!: string;

  @Column({ type: 'uuid', nullable: true })
  userId?: string;

  @Column({
    type: 'enum',
    enum: OrderType,
    default: OrderType.TAKEAWAY,
  })
  orderType: OrderType;

  @Column({ type: 'uuid', nullable: true })
  tableId?: string;

  @Column({ type: 'int', nullable: true })
  partySize?: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  orderSource?: string;

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

  // null = "for now" (unchanged existing behavior). When set, must fall on a
  // valid slot boundary for the org's orderSchedulingIntervalMinutes and is
  // backed by a capacity reservation on the matching OrderSlot row.
  @Column({ type: 'timestamptz', nullable: true })
  scheduledFor?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// PROD MIGRATION NOTE (TypeORM synchronize handles dev automatically; do NOT
// run synchronize in production):
//   ALTER TABLE orders ADD COLUMN "scheduledFor" timestamptz;
