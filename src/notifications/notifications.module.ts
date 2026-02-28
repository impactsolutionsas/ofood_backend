import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SmsService } from './sms.service';
import { TermiiStrategy } from './strategies/termii.strategy';
import { InfobipStrategy } from './strategies/infobip.strategy';
import { ConsoleStrategy } from './strategies/console.strategy';

@Module({
  imports: [ConfigModule],
  providers: [SmsService, TermiiStrategy, InfobipStrategy, ConsoleStrategy],
  exports: [SmsService],
})
export class NotificationsModule {}
