import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { envs } from './config';
import { PAYMENTS_EVENTS_CLIENT, ORGANIZATION_SERVICE } from './config/services';
import { OrdersModule } from './orders/orders.module';
import { TablesModule } from './tables/tables.module';
import { SectorsModule } from './sectors/sectors.module';
import { CashSessionsModule } from './cash-sessions/cash-sessions.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { RabbitMQModule } from './config/transports/rabbitmq.module';
import { RedisModule } from './redis/redis.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: envs.dbHost,
      port: envs.dbPort ?? 5432,
      username: envs.postgresUser,
      password: envs.postgresPassword,
      database: envs.postgresDb,
      autoLoadEntities: true,
      synchronize: envs.nodeEnv === 'development',
    }),
    RabbitMQModule.register({
      name: PAYMENTS_EVENTS_CLIENT,
      queue: envs.rabbitmqPaymentEventQueue,
      url: envs.rabbitmqUrl,
    }),
    // Request/response client into organization-ms's RPC queue — used to read
    // scheduling config (orderSchedulingIntervalMinutes, maxDishesPerSlot,
    // openingHours) when validating scheduled orders. Same queue name/pattern
    // client-gateway already uses for ORGANIZATION_SERVICE.
    RabbitMQModule.register({
      name: ORGANIZATION_SERVICE,
      queue: 'organization_queue',
      url: envs.rabbitmqUrl,
    }),
    OrdersModule,
    TablesModule,
    SectorsModule,
    CashSessionsModule,
    AnalyticsModule,
    RedisModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
