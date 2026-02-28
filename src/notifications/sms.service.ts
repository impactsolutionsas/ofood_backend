import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ISmsStrategy } from './strategies/sms-strategy.interface';
import { TermiiStrategy } from './strategies/termii.strategy';
import { InfobipStrategy } from './strategies/infobip.strategy';
import { ConsoleStrategy } from './strategies/console.strategy';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly strategy: ISmsStrategy;

  constructor(
    private configService: ConfigService,
    termiiStrategy: TermiiStrategy,
    infobipStrategy: InfobipStrategy,
    consoleStrategy: ConsoleStrategy,
  ) {
    const provider = this.configService.get<string>('SMS_PROVIDER', 'console');

    switch (provider) {
      case 'infobip':
        this.strategy = infobipStrategy;
        break;
      case 'termii':
        this.strategy = termiiStrategy;
        break;
      case 'console':
        this.strategy = consoleStrategy;
        break;
      default:
        this.strategy = consoleStrategy;
    }

    this.logger.log(`SMS provider: ${provider}`);
  }

  async sendSms(phone: string, message: string): Promise<void> {
    await this.strategy.sendSms(phone, message);
  }
}
