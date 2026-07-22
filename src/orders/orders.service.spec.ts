import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrdersService } from './orders.service';
import { Order } from './entities/order.entity';
import { OrderStatus } from '../common/enums/order-status.enum';
import { PaymentStatus } from '../common/enums/payment-status.enum';
import { PAYMENTS_EVENTS_CLIENT, ORGANIZATION_SERVICE } from '../config/services';

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_1 = 'u1111111-1111-1111-1111-111111111111';
const USER_2 = 'u2222222-2222-2222-2222-222222222222';
const ORDER_A1 = 'o1111111-1111-1111-1111-111111111111'; // ORG_A, USER_1
const ORDER_A2 = 'o2222222-2222-2222-2222-222222222222'; // ORG_A, USER_2
const ORDER_B1 = 'ob111111-1111-1111-1111-111111111111'; // ORG_B, USER_1

function matchesWhere(row: any, where: any): boolean {
  return Object.entries(where).every(
    ([k, v]) => v === undefined || row[k] === v,
  );
}

describe('OrdersService — IDOR regression', () => {
  let service: OrdersService;
  let rows: any[];

  const fakeRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    merge: jest.fn(),
    update: jest.fn(),
  };

  const fakeQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      save: jest.fn((_entity: any, o: any) => Promise.resolve(o)),
      update: jest.fn(),
      create: jest.fn((_entity: any, o: any) => o),
      findOne: jest.fn(),
    },
  };

  const fakeDataSource = {
    getRepository: jest.fn(() => fakeRepo),
    createQueryRunner: jest.fn(() => fakeQueryRunner),
  };

  function makeRows() {
    return [
      {
        id: ORDER_A1,
        organizationId: ORG_A,
        userId: USER_1,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        currency: 'EUR',
        subtotal: 10,
        total: 10,
        orderNumber: 1,
        customerName: 'Alice',
        createdAt: new Date(),
        items: [],
      },
      {
        id: ORDER_A2,
        organizationId: ORG_A,
        userId: USER_2,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        currency: 'EUR',
        subtotal: 20,
        total: 20,
        orderNumber: 2,
        customerName: 'Bob',
        createdAt: new Date(),
        items: [],
      },
      {
        id: ORDER_B1,
        organizationId: ORG_B,
        userId: USER_1,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        currency: 'EUR',
        subtotal: 30,
        total: 30,
        orderNumber: 1,
        customerName: 'Carol',
        createdAt: new Date(),
        items: [],
      },
    ];
  }

  beforeEach(async () => {
    rows = makeRows();

    fakeRepo.findOne.mockImplementation(async ({ where }: any) =>
      rows.find((r) => matchesWhere(r, where)) ?? null,
    );
    fakeRepo.save.mockImplementation(async (o: any) => o);
    fakeRepo.merge.mockImplementation((target: any, source: any) =>
      Object.assign(target, source),
    );
    fakeRepo.update.mockResolvedValue({ affected: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: DataSource, useValue: fakeDataSource },
        { provide: getRepositoryToken(Order), useValue: fakeRepo },
        { provide: PAYMENTS_EVENTS_CLIENT, useValue: { emit: jest.fn(), send: jest.fn() } },
        { provide: ORGANIZATION_SERVICE, useValue: { emit: jest.fn(), send: jest.fn() } },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findOne ─────────────────────────────────────────────────────────────
  describe('findOne', () => {
    it('returns the order when org matches', async () => {
      const result = await service.findOne({
        id: ORDER_A1,
        organizationId: ORG_A,
      });
      expect(result.id).toBe(ORDER_A1);
    });

    it('rejects (notFound) when order belongs to a different org', async () => {
      await expect(
        service.findOne({ id: ORDER_B1, organizationId: ORG_A }),
      ).rejects.toThrow();
    });

    it('rejects when userId does not match within the same org', async () => {
      await expect(
        service.findOne({
          id: ORDER_A1,
          organizationId: ORG_A,
          userId: USER_2,
        }),
      ).rejects.toThrow();
    });

    it('returns the order when userId matches within the same org', async () => {
      const result = await service.findOne({
        id: ORDER_A1,
        organizationId: ORG_A,
        userId: USER_1,
      });
      expect(result.id).toBe(ORDER_A1);
    });
  });

  // ─── updatePaymentStatus ─────────────────────────────────────────────────
  describe('updatePaymentStatus', () => {
    it('rejects and never calls save when order belongs to another org', async () => {
      await expect(
        service.updatePaymentStatus(ORDER_B1, PaymentStatus.PAID, ORG_A),
      ).rejects.toThrow();
      expect(fakeRepo.save).not.toHaveBeenCalled();
    });

    it('updates payment status and calls save once for the correct org', async () => {
      const result = await service.updatePaymentStatus(
        ORDER_A1,
        PaymentStatus.PAID,
        ORG_A,
      );
      expect(fakeRepo.save).toHaveBeenCalledTimes(1);
      expect((result as any).paymentStatus).toBe(PaymentStatus.PAID);
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────
  describe('update', () => {
    it('rejects when order belongs to another org', async () => {
      await expect(
        service.update({ id: ORDER_B1, organizationId: ORG_A } as any),
      ).rejects.toThrow();
    });

    it('saves the updated order for the correct org', async () => {
      const result = await service.update({
        id: ORDER_A1,
        organizationId: ORG_A,
        status: OrderStatus.IN_PROGRESS,
      } as any);
      expect(fakeQueryRunner.manager.save).toHaveBeenCalledTimes(1);
      expect((result as any).id).toBe(ORDER_A1);
    });
  });
});
