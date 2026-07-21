import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CashSessionStatus } from 'src/common/enums/cash-session-status.enum';

@Entity('cash_sessions')
@Index(['organizationId', 'status'])
@Index(['organizationId'])
// Partial unique index — the DB-level guarantee that backs "one open cash
// session per organization". TypeORM 0.3.x's IndexOptions.where is passed
// through verbatim as the index's filter condition, so `synchronize` (dev
// only) creates this as a real Postgres partial unique index, not just an
// app-level check. See the PROD MIGRATION NOTE below for the manual DDL.
@Index(['organizationId'], { unique: true, where: "status = 'OPEN'" })
export class CashSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'enum', enum: CashSessionStatus, default: CashSessionStatus.OPEN })
  status: CashSessionStatus;

  @Column({ type: 'uuid' })
  openedBy: string;

  @Column({ type: 'timestamptz' })
  openedAt: Date;

  @Column({ type: 'int' })
  openingCash: number;

  @Column({ type: 'uuid', nullable: true })
  closedBy?: string;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt?: Date;

  @Column({ type: 'int', nullable: true })
  countedCash?: number;

  @Column({ type: 'int', nullable: true })
  expectedCash?: number;

  @Column({ type: 'int', nullable: true })
  discrepancy?: number;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// PROD MIGRATION NOTE (TypeORM synchronize handles dev automatically; do NOT
// run synchronize in production):
//   CREATE TYPE "cash_sessions_status_enum" AS ENUM ('OPEN', 'CLOSED');
//   CREATE TABLE "cash_sessions" (
//     "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
//     "organizationId" uuid NOT NULL,
//     "status" "cash_sessions_status_enum" NOT NULL DEFAULT 'OPEN',
//     "openedBy" uuid NOT NULL,
//     "openedAt" timestamptz NOT NULL,
//     "openingCash" integer NOT NULL,
//     "closedBy" uuid,
//     "closedAt" timestamptz,
//     "countedCash" integer,
//     "expectedCash" integer,
//     "discrepancy" integer,
//     "notes" text,
//     "createdAt" timestamptz NOT NULL DEFAULT now(),
//     "updatedAt" timestamptz NOT NULL DEFAULT now(),
//     CONSTRAINT "PK_cash_sessions_id" PRIMARY KEY ("id")
//   );
//   CREATE INDEX "IDX_cash_sessions_organizationId_status" ON "cash_sessions" ("organizationId", "status");
//   CREATE INDEX "IDX_cash_sessions_organizationId" ON "cash_sessions" ("organizationId");
//   -- Enforces "one open cash session per organization" at the DB level —
//   -- required because CashSessionsService.open() only does a
//   -- findOne-then-save check, which is not safe under concurrent requests.
//   CREATE UNIQUE INDEX "ux_cash_sessions_org_open" ON "cash_sessions" ("organizationId") WHERE status = 'OPEN';
