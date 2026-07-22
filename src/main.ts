import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  MicroserviceOptions,
  RpcException,
  Transport,
} from '@nestjs/microservices';
import { Logger, ValidationPipe } from '@nestjs/common';
import { envs } from './config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule);

  // Global pipes must be registered before connectMicroservice(): each call
  // synchronously binds that microservice's pattern handlers via
  // registerListeners(), snapshotting whatever pipes exist on the shared
  // ApplicationConfig at that moment. Pipes added afterwards are silently
  // ignored for those handlers (Nest logs "Global pipes registered after
  // initialization will not be applied.").
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const messages = errors.map(
          (err) =>
            `${err.constraints ? Object.values(err.constraints).join(', ') : ''}`,
        );
        return new RpcException({
          statusCode: 400,
          message: messages,
        });
      },
    }),
  );

  // 🔹 RPC (send)
  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.RMQ,
      options: {
        urls: [envs.rabbitmqUrl],
        queue: envs.rabbitmqQueue,
        queueOptions: {
          durable: true,
        },
      },
    },
    { inheritAppConfig: true },
  );

  // 🔹 EVENTS (consume — bound to app.events topic exchange)
  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.RMQ,
      options: {
        urls: [envs.rabbitmqUrl],
        queue: envs.rabbitmqOrdersEventQueue,
        exchange: 'app.events',
        exchangeType: 'topic',
        queueOptions: {
          durable: true,
        },
      },
    },
    { inheritAppConfig: true },
  );

  await app.startAllMicroservices();

  logger.log('Microservice is starting...');
  await app.listen(envs.port);
}
bootstrap();
