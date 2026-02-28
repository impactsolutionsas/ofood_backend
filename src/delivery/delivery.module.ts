import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { DispatchService } from './dispatch.service';
import { TrackingGateway } from './tracking.gateway';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [DeliveryController],
  providers: [DeliveryService, DispatchService, TrackingGateway],
  exports: [DeliveryService],
})
export class DeliveryModule {}
