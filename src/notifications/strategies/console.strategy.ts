import { Injectable, Logger } from '@nestjs/common';
import { ISmsStrategy } from './sms-strategy.interface';

@Injectable()
export class ConsoleStrategy implements ISmsStrategy {
  private readonly logger = new Logger(ConsoleStrategy.name);

  async sendSms(phone: string, message: string): Promise<void> {
    this.logger.log(`SMS to ${phone}: ${message}`);
  }
}
