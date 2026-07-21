import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AnalyticsService } from './analytics.service';
import { ANALYTICS_PATTERNS } from './patterns/analytics.patterns';
import { AnalyticsRangeDto } from './dto/analytics-range.dto';
import { AnalyticsTopProductsDto } from './dto/analytics-top-products.dto';

@Controller()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @MessagePattern(ANALYTICS_PATTERNS.OVERVIEW)
  overview(@Payload() dto: AnalyticsRangeDto) {
    return this.analyticsService.overview(dto);
  }

  @MessagePattern(ANALYTICS_PATTERNS.SALES_BY_TYPE)
  salesByType(@Payload() dto: AnalyticsRangeDto) {
    return this.analyticsService.salesByType(dto);
  }

  @MessagePattern(ANALYTICS_PATTERNS.TOP_PRODUCTS)
  topProducts(@Payload() dto: AnalyticsTopProductsDto) {
    return this.analyticsService.topProducts(dto);
  }

  @MessagePattern(ANALYTICS_PATTERNS.CATEGORY_BREAKDOWN)
  categoryBreakdown(@Payload() dto: AnalyticsRangeDto) {
    return this.analyticsService.categoryBreakdown(dto);
  }
}
