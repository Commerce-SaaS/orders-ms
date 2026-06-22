import { Global, Module } from '@nestjs/common';
import { RedisProvider } from './providers/redis.provider';

@Global()
@Module({
    providers: [RedisProvider],
    exports: [RedisProvider]
})
export class RedisModule {}
