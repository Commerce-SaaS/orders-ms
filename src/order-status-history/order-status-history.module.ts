import { Module } from '@nestjs/common';
import { OrderStatusHistoryService } from './order-status-history.service';
import { OrderStatusHistoryController } from './order-status-history.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderStatusHistory } from './entities/order-status-history.entity';

@Module({
  providers: [OrderStatusHistoryService],
  controllers: [OrderStatusHistoryController],
  imports: [TypeOrmModule.forFeature([OrderStatusHistory])],
})
export class OrderStatusHistoryModule {}
