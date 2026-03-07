import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  ManyToOne,
  Column,
  JoinColumn,
} from 'typeorm';
import { OrderItem } from './order-item.entity';

@Entity('order_item_removed_ingredient')
@Index(['orderItemId', 'organizationId'])
export class OrderItemRemovedIngredient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orderItemId: string;

  @ManyToOne(() => OrderItem, (item) => item.removedIngredients, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'orderItemId' })
  orderItem: OrderItem;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column('uuid')
  ingredientId: string;

  @Column()
  ingredientName: string;
}
