import { DynamicModule, Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Global()
@Module({})
export class RabbitMQModule {
  static register({
    name,
    queue,
    url,
    exchange = 'app.events',
  }: {
    name: string;
    queue: string;
    url: string;
    exchange?: string;
  }): DynamicModule {
    return {
      module: RabbitMQModule,
      imports: [
        ClientsModule.register([
          {
            name,
            transport: Transport.RMQ,
            options: {
              urls: [url],
              exchange,
              exchangeType: 'topic',
              queue,
              queueOptions: { durable: true },
            },
          },
        ]),
      ],
      exports: [ClientsModule],
    };
  }
}
