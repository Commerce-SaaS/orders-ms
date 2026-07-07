import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { envs } from './config';
import { PAYMENTS_EVENTS_CLIENT } from './config/services';
import { OrdersModule } from './orders/orders.module';
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
    OrdersModule,
    RedisModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
