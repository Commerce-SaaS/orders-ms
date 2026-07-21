import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { CashSession } from './entities/cash-session.entity';
import { Order } from 'src/orders/entities/order.entity';
import { CashSessionStatus } from 'src/common/enums/cash-session-status.enum';
import { OrderStatus } from 'src/common/enums/order-status.enum';
import { RpcExceptionHelper } from 'src/common/helpers/rpc-exception.helper';
import { OpenCashSessionDto } from './dto/open-cash-session.dto';
import { CloseCashSessionDto } from './dto/close-cash-session.dto';
import { CurrentCashSessionDto } from './dto/current-cash-session.dto';
import { CashSessionsPaginationDto } from './dto/cash-sessions-pagination.dto';
import { FindOneByOrgDto } from 'src/common/dto/find-one-by-org.dto';

// Order statuses that block closing a cash session — the same set the POS
// treats as "not yet resolved" (still needs completing or cancelling).
const ACTIVE_ORDER_STATUSES = [
  OrderStatus.PENDING,
  OrderStatus.IN_PROGRESS,
  OrderStatus.READY,
  OrderStatus.REOPENED,
];

// ARCHITECTURE NOTE: orders-ms does NOT call payments-ms directly. Merging
// order-side stats (this module) with payment-method totals (payments-ms) is
// done by client-gateway, which already holds a ClientProxy for both
// services — see cash-sessions REPORT pattern below, which only returns the
// order-side half of the ticket Z report.
@Injectable()
export class CashSessionsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CashSession)
    private readonly cashSessionRepository: Repository<CashSession>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  async open(dto: OpenCashSessionDto) {
    const existing = await this.cashSessionRepository.findOne({
      where: { organizationId: dto.organizationId, status: CashSessionStatus.OPEN },
    });
    if (existing) {
      RpcExceptionHelper.conflictWithCode(
        'CASH_SESSION_ALREADY_OPEN',
        'A cash session is already open for this organization',
      );
    }

    try {
      const session = this.cashSessionRepository.create({
        organizationId: dto.organizationId,
        status: CashSessionStatus.OPEN,
        openedBy: dto.userId,
        openedAt: new Date(),
        openingCash: dto.openingCash,
      });
      const saved = await this.cashSessionRepository.save(session);
      return this.mapCashSessionResponse(saved);
    } catch (error) {
      // The in-memory check above is a best-effort fast path — the real
      // guarantee is the partial unique index (ux_cash_sessions_org_open, see
      // the entity's PROD MIGRATION NOTE). Two concurrent opens for the same
      // org can both pass the findOne check and race to save(); whichever
      // loses hits 23505 here and gets the same error the loser of the
      // in-memory check would have gotten.
      if (error.code === '23505') {
        RpcExceptionHelper.conflictWithCode(
          'CASH_SESSION_ALREADY_OPEN',
          'A cash session is already open for this organization',
        );
      }
      RpcExceptionHelper.handle(error);
    }
  }

  // Closes the given session and immediately opens its replacement in the
  // same transaction — the register is never left without an active session.
  // Ordering matters here: the old row must be flipped to CLOSED (dropping it
  // out of the partial unique index's WHERE status = 'OPEN' predicate) BEFORE
  // the new OPEN row is inserted, or the insert would race the still-OPEN old
  // row and violate ux_cash_sessions_org_open.
  async close(dto: CloseCashSessionDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const session = await queryRunner.manager
        .createQueryBuilder(CashSession, 'cash_session')
        .where(
          'cash_session.id = :id AND cash_session.organizationId = :organizationId AND cash_session.status = :status',
          { id: dto.id, organizationId: dto.organizationId, status: CashSessionStatus.OPEN },
        )
        .setLock('pessimistic_write')
        .getOne();

      if (!session) RpcExceptionHelper.notFound('Open cash session');

      const activeOrdersCount = await queryRunner.manager.count(Order, {
        where: { cashSessionId: dto.id, status: In(ACTIVE_ORDER_STATUSES) },
      });

      if (activeOrdersCount > 0) {
        RpcExceptionHelper.conflictWithCode(
          'CASH_SESSION_HAS_ACTIVE_ORDERS',
          `Hay ${activeOrdersCount} orden(es) activa(s) que deben completarse o cancelarse antes de cerrar la caja`,
        );
      }

      const discrepancy = dto.countedCash - dto.expectedCash;

      session.status = CashSessionStatus.CLOSED;
      session.closedBy = dto.userId;
      session.closedAt = new Date();
      session.countedCash = dto.countedCash;
      session.expectedCash = dto.expectedCash;
      session.discrepancy = discrepancy;
      if (dto.notes !== undefined) session.notes = dto.notes;

      const closedSession = await queryRunner.manager.save(session);

      // The physical cash in the drawer doesn't disappear on close — the new
      // shift starts with what was just counted.
      const newSession = queryRunner.manager.create(CashSession, {
        organizationId: dto.organizationId,
        status: CashSessionStatus.OPEN,
        openedBy: dto.userId,
        openedAt: new Date(),
        openingCash: dto.countedCash,
      });
      const savedNewSession = await queryRunner.manager.save(newSession);

      await queryRunner.commitTransaction();

      return {
        closedSession: this.mapCashSessionResponse(closedSession),
        newSession: this.mapCashSessionResponse(savedNewSession),
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      RpcExceptionHelper.handle(error);
    } finally {
      await queryRunner.release();
    }
  }

  async current(dto: CurrentCashSessionDto) {
    const session = await this.cashSessionRepository.findOne({
      where: { organizationId: dto.organizationId, status: CashSessionStatus.OPEN },
    });
    if (!session) RpcExceptionHelper.notFound('Open cash session');
    return this.mapCashSessionResponse(session);
  }

  async findOne(dto: FindOneByOrgDto) {
    const session = await this.cashSessionRepository.findOne({
      where: { id: dto.id, organizationId: dto.organizationId },
    });
    if (!session) RpcExceptionHelper.notFound('Cash session');
    return this.mapCashSessionResponse(session);
  }

  async findAll(dto: CashSessionsPaginationDto) {
    const { organizationId, status, offset = 0, limit = 20 } = dto;
    const effectiveLimit = limit > 0 ? limit : 20;

    const query = this.cashSessionRepository
      .createQueryBuilder('cash_session')
      .where('cash_session.organizationId = :organizationId', { organizationId });

    if (status) {
      query.andWhere('cash_session.status = :status', { status });
    }

    const totalItems = await query.getCount();

    const items = await query
      .clone()
      .orderBy('cash_session.openedAt', 'DESC')
      .skip(offset)
      .take(effectiveLimit)
      .getMany();

    return {
      items: items.map((s) => this.mapCashSessionResponse(s)),
      totalItems,
      totalPages: Math.ceil(totalItems / effectiveLimit),
      currentPage: Math.floor(offset / effectiveLimit) + 1,
      hasMore: offset + effectiveLimit < totalItems,
    };
  }

  // Order-side half of the ticket Z report. client-gateway merges this with
  // payments-ms's totals-by-method report to build the full ticket.
  async report(dto: FindOneByOrgDto) {
    const session = await this.cashSessionRepository.findOne({
      where: { id: dto.id, organizationId: dto.organizationId },
    });
    if (!session) RpcExceptionHelper.notFound('Cash session');

    // Informational only now — client-gateway filters payments-ms totals by
    // cashSessionId directly (Payment.cashSessionId), not by this window.
    // Kept in the response so the report can still show the shift's time span.
    const windowStart = session.openedAt;
    const windowEnd = session.closedAt ?? new Date();

    const baseQuery = this.orderRepository
      .createQueryBuilder('order')
      .where('order.organizationId = :organizationId', { organizationId: dto.organizationId })
      .andWhere('order.cashSessionId = :sessionId', { sessionId: dto.id });

    const totalOrders = await baseQuery.clone().getCount();
    const cancelledOrders = await baseQuery
      .clone()
      .andWhere('order.status = :cancelled', { cancelled: OrderStatus.CANCELLED })
      .getCount();

    return {
      session: this.mapCashSessionResponse(session),
      window: { from: windowStart, to: windowEnd },
      orders: {
        totalOrders,
        cancelledOrders,
        completedOrders: totalOrders - cancelledOrders,
      },
    };
  }

  private mapCashSessionResponse(session: CashSession) {
    return {
      id: session.id,
      organizationId: session.organizationId,
      status: session.status,
      openedBy: session.openedBy,
      openedAt: session.openedAt,
      openingCash: session.openingCash,
      closedBy: session.closedBy ?? null,
      closedAt: session.closedAt ?? null,
      countedCash: session.countedCash ?? null,
      expectedCash: session.expectedCash ?? null,
      discrepancy: session.discrepancy ?? null,
      notes: session.notes ?? null,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }
}
