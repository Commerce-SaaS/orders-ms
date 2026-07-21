import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

import { Order } from 'src/orders/entities/order.entity';
import { OrderItem } from 'src/orders/entities/order-item.entity';
import { OrderStatus } from 'src/common/enums/order-status.enum';
import { AnalyticsPeriod } from 'src/common/enums/analytics-period.enum';
import { AnalyticsRangeDto } from './dto/analytics-range.dto';
import { AnalyticsTopProductsDto } from './dto/analytics-top-products.dto';

const DEFAULT_TOP_PRODUCTS_LIMIT = 5;

interface DateWindow {
  from: Date;
  to: Date;
}

interface ResolvedRange extends DateWindow {
  previous: DateWindow;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
  ) {}

  async overview(dto: AnalyticsRangeDto) {
    const { organizationId, period } = dto;
    const range = this.resolveRange(period, dto.from, dto.to);

    const [current, previous] = await Promise.all([
      this.aggregateOrders(organizationId, range.from, range.to),
      this.aggregateOrders(organizationId, range.previous.from, range.previous.to),
    ]);

    const series = await this.buildSeries(organizationId, period, range.from, range.to);

    return {
      revenueTotal: current.revenueTotal,
      revenueGrowth: this.percentChange(current.revenueTotal, previous.revenueTotal),
      ordersTotal: current.ordersTotal,
      ordersGrowth: this.percentChange(current.ordersTotal, previous.ordersTotal),
      series,
    };
  }

  async salesByType(dto: AnalyticsRangeDto) {
    const { organizationId, period } = dto;
    const range = this.resolveRange(period, dto.from, dto.to);

    const rows = await this.orderRepository
      .createQueryBuilder('order')
      .select('order.orderType', 'orderType')
      .addSelect('COUNT(order.id)', 'ordersCount')
      .addSelect('SUM(order.total)', 'revenueTotal')
      .where('order.organizationId = :organizationId', { organizationId })
      .andWhere('order.createdAt >= :from AND order.createdAt < :to', {
        from: range.from,
        to: range.to,
      })
      .andWhere('order.status != :cancelled', { cancelled: OrderStatus.CANCELLED })
      .groupBy('order.orderType')
      .getRawMany<{ orderType: string; ordersCount: string; revenueTotal: string }>();

    return rows.map((row) => ({
      orderType: row.orderType,
      ordersCount: Number(row.ordersCount),
      revenueTotal: Number(row.revenueTotal),
    }));
  }

  async topProducts(dto: AnalyticsTopProductsDto) {
    const { organizationId, period, limit } = dto;
    const range = this.resolveRange(period, dto.from, dto.to);
    const effectiveLimit = limit && limit > 0 ? limit : DEFAULT_TOP_PRODUCTS_LIMIT;

    const rows = await this.orderItemRepository
      .createQueryBuilder('item')
      .innerJoin(Order, 'order', 'order.id = item.orderId')
      .select('item.productId', 'productId')
      .addSelect('item.name', 'name')
      .addSelect('SUM(item.total)', 'revenueTotal')
      .addSelect('COUNT(DISTINCT item.orderId)', 'ordersCount')
      .where('item.organizationId = :organizationId', { organizationId })
      .andWhere('order.createdAt >= :from AND order.createdAt < :to', {
        from: range.from,
        to: range.to,
      })
      .andWhere('order.status != :cancelled', { cancelled: OrderStatus.CANCELLED })
      .groupBy('item.productId')
      .addGroupBy('item.name')
      .orderBy('"revenueTotal"', 'DESC')
      .limit(effectiveLimit)
      .getRawMany<{
        productId: string;
        name: string;
        revenueTotal: string;
        ordersCount: string;
      }>();

    return rows.map((row) => ({
      productId: row.productId,
      name: row.name,
      revenueTotal: Number(row.revenueTotal),
      ordersCount: Number(row.ordersCount),
    }));
  }

  async categoryBreakdown(dto: AnalyticsRangeDto) {
    const { organizationId, period } = dto;
    const range = this.resolveRange(period, dto.from, dto.to);

    const rows = await this.orderItemRepository
      .createQueryBuilder('item')
      .innerJoin(Order, 'order', 'order.id = item.orderId')
      .select('item.categoryId', 'categoryId')
      .addSelect('item.categoryName', 'categoryName')
      .addSelect('SUM(item.total)', 'revenueTotal')
      .where('item.organizationId = :organizationId', { organizationId })
      .andWhere('order.createdAt >= :from AND order.createdAt < :to', {
        from: range.from,
        to: range.to,
      })
      .andWhere('order.status != :cancelled', { cancelled: OrderStatus.CANCELLED })
      .groupBy('item.categoryId')
      .addGroupBy('item.categoryName')
      .getRawMany<{ categoryId: string | null; categoryName: string | null; revenueTotal: string }>();

    return rows.map((row) => ({
      categoryId: row.categoryId ?? null,
      categoryName: row.categoryName ?? 'Uncategorized',
      revenueTotal: Number(row.revenueTotal),
    }));
  }

  private async aggregateOrders(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<{ revenueTotal: number; ordersTotal: number }> {
    const row = await this.orderRepository
      .createQueryBuilder('order')
      .select('SUM(order.total)', 'revenueTotal')
      .addSelect('COUNT(order.id)', 'ordersTotal')
      .where('order.organizationId = :organizationId', { organizationId })
      .andWhere('order.createdAt >= :from AND order.createdAt < :to', { from, to })
      .andWhere('order.status != :cancelled', { cancelled: OrderStatus.CANCELLED })
      .getRawOne<{ revenueTotal: string | null; ordersTotal: string }>();

    return {
      revenueTotal: Number(row?.revenueTotal ?? 0),
      ordersTotal: Number(row?.ordersTotal ?? 0),
    };
  }

  // Buckets the range at the granularity implied by `period` (hour/day/month)
  // and zero-fills buckets with no orders, so the series always has one point
  // per slot regardless of data sparsity.
  private async buildSeries(
    organizationId: string,
    period: AnalyticsPeriod,
    from: Date,
    to: Date,
  ): Promise<{ label: string; value: number }[]> {
    const { truncUnit, labelFormat, stepUnit } = this.bucketConfig(period);

    const rows = await this.orderRepository
      .createQueryBuilder('order')
      .select(`date_trunc('${truncUnit}', "order"."createdAt")`, 'bucket')
      .addSelect('SUM(order.total)', 'revenueTotal')
      .where('order.organizationId = :organizationId', { organizationId })
      .andWhere('order.createdAt >= :from AND order.createdAt < :to', { from, to })
      .andWhere('order.status != :cancelled', { cancelled: OrderStatus.CANCELLED })
      .groupBy('bucket')
      .getRawMany<{ bucket: Date; revenueTotal: string }>();

    const valueByBucket = new Map(
      rows.map((row) => [dayjs.utc(row.bucket).valueOf(), Number(row.revenueTotal)]),
    );

    const buckets: { label: string; value: number }[] = [];
    let cursor = dayjs.utc(from);
    const end = dayjs.utc(to);
    while (cursor.isBefore(end)) {
      buckets.push({
        label: cursor.format(labelFormat),
        value: valueByBucket.get(cursor.valueOf()) ?? 0,
      });
      cursor = cursor.add(1, stepUnit);
    }
    return buckets;
  }

  private bucketConfig(period: AnalyticsPeriod): {
    truncUnit: string;
    stepUnit: 'hour' | 'day' | 'month';
    labelFormat: string;
  } {
    switch (period) {
      case AnalyticsPeriod.DAY:
        return { truncUnit: 'hour', stepUnit: 'hour', labelFormat: 'HH:00' };
      case AnalyticsPeriod.YEAR:
        return { truncUnit: 'month', stepUnit: 'month', labelFormat: 'YYYY-MM' };
      case AnalyticsPeriod.MONTH:
      default:
        return { truncUnit: 'day', stepUnit: 'day', labelFormat: 'YYYY-MM-DD' };
    }
  }

  // Resolves the effective [from, to) window and its immediately-preceding
  // equivalent-length window used for growth comparisons. Explicit from/to
  // (when both given) are used verbatim; otherwise the window defaults to
  // the current UTC day/month/year for the given period.
  private resolveRange(period: AnalyticsPeriod, from?: string, to?: string): ResolvedRange {
    if (from && to) {
      const start = dayjs.utc(from);
      const end = dayjs.utc(to);
      const rangeMs = end.valueOf() - start.valueOf();
      return {
        from: start.toDate(),
        to: end.toDate(),
        previous: {
          from: start.subtract(rangeMs, 'millisecond').toDate(),
          to: start.toDate(),
        },
      };
    }

    const now = dayjs.utc();
    switch (period) {
      case AnalyticsPeriod.DAY: {
        const start = now.startOf('day');
        const end = start.add(1, 'day');
        return {
          from: start.toDate(),
          to: end.toDate(),
          previous: { from: start.subtract(1, 'day').toDate(), to: start.toDate() },
        };
      }
      case AnalyticsPeriod.YEAR: {
        const start = now.startOf('year');
        const end = start.add(1, 'year');
        return {
          from: start.toDate(),
          to: end.toDate(),
          previous: { from: start.subtract(1, 'year').toDate(), to: start.toDate() },
        };
      }
      case AnalyticsPeriod.MONTH:
      default: {
        const start = now.startOf('month');
        const end = start.add(1, 'month');
        return {
          from: start.toDate(),
          to: end.toDate(),
          previous: { from: start.subtract(1, 'month').toDate(), to: start.toDate() },
        };
      }
    }
  }

  private percentChange(current: number, previous: number): number {
    if (previous === 0) return current === 0 ? 0 : 100;
    return ((current - previous) / previous) * 100;
  }
}
