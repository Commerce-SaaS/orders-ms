import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TableStatus } from 'src/common/enums/table-status.enum';
import { TableShape } from 'src/common/enums/table-shape.enum';

@Entity('tables')
@Index(['organizationId', 'status'])
@Index(['organizationId', 'name'], { unique: true })
export class Table {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'int', nullable: true })
  capacity?: number;

  @Column({ type: 'enum', enum: TableStatus, default: TableStatus.FREE })
  status: TableStatus;

  @Column({ type: 'enum', enum: TableShape, default: TableShape.SQUARE })
  shape: TableShape;

  @Column({ type: 'uuid', nullable: true })
  currentOrderId?: string;

  @Column({ type: 'boolean', default: false })
  isDeleted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
