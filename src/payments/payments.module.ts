import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { MockPaymentStrategy } from './strategies/mock-payment.strategy';
import { OrangeMoneyStrategy } from './strategies/orange-money.strategy';

@Module({
  imports: [NotificationsModule, OrdersModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, MockPaymentStrategy, OrangeMoneyStrategy],
  exports: [PaymentsService],
})
export class PaymentsModule {}
