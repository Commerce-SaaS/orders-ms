import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashSession } from './entities/cash-session.entity';
import { Order } from 'src/orders/entities/order.entity';
import { CashSessionsController } from './cash-sessions.controller';
import { CashSessionsService } from './cash-sessions.service';

@Module({
  imports: [TypeOrmModule.forFeature([CashSession, Order])],
  controllers: [CashSessionsController],
  providers: [CashSessionsService],
})
export class CashSessionsModule {}
