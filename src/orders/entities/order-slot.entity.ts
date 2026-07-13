import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

// One row per (organizationId, scheduledFor). Locked with pessimistic_write
// (same pattern as Table.status in table.entity.ts) so concurrent order
// creations against the same slot serialize instead of racing on a SUM()
// over order_items.
@Entity('order_slots')
@Unique(['organizationId', 'scheduledFor'])
@Index(['organizationId', 'scheduledFor'])
export class OrderSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'timestamptz' })
  scheduledFor: Date;

  @Column({ type: 'int', default: 0 })
  dishesBooked: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// PROD MIGRATION NOTE (TypeORM synchronize handles dev automatically; do NOT
// run synchronize in production):
//   CREATE TABLE order_slots (
//     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     "organizationId" uuid NOT NULL,
//     "scheduledFor" timestamptz NOT NULL,
//     "dishesBooked" int NOT NULL DEFAULT 0,
//     "createdAt" timestamptz NOT NULL DEFAULT now(),
//     "updatedAt" timestamptz NOT NULL DEFAULT now(),
//     UNIQUE ("organizationId", "scheduledFor")
//   );
//   CREATE INDEX ON order_slots ("organizationId", "scheduledFor");
