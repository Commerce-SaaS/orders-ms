// PROD MIGRATION NOTE: adding this enum type requires:
//   CREATE TYPE order_item_status AS ENUM ('NEW', 'SENT_TO_KITCHEN', 'PREPARED');
//   ALTER TABLE order_items ADD COLUMN status order_item_status NOT NULL DEFAULT 'NEW';
// TypeORM synchronize handles dev automatically; do NOT run synchronize in production.
export enum OrderItemStatus {
  NEW = 'NEW',
  SENT_TO_KITCHEN = 'SENT_TO_KITCHEN',
  PREPARED = 'PREPARED',
}
