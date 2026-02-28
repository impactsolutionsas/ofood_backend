import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ISmsStrategy } from './sms-strategy.interface';

@Injectable()
export class InfobipStrategy implements ISmsStrategy {
  private readonly logger = new Logger(InfobipStrategy.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly sender: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('INFOBIP_API_KEY', '');
    this.baseUrl = this.configService.get<string>('INFOBIP_BASE_URL', '');
    this.sender = this.configService.get<string>('INFOBIP_SENDER', 'OFood');
  }

  async sendSms(phone: string, message: string): Promise<void> {
    const normalizedPhone = this.normalizePhone(phone);

    const response = await fetch(`${this.baseUrl}/sms/3/messages`, {
      method: 'POST',
      headers: {
        Authorization: `App ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            sender: this.sender,
            destinations: [{ to: normalizedPhone }],
            content: { text: message },
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Infobip SMS failed: ${response.status} - ${errorBody}`,
      );
    }

    this.logger.log(`SMS sent to ${normalizedPhone} via Infobip`);
  }

  private normalizePhone(phone: string): string {
    let normalized = phone.replace(/\D/g, '');
    if (normalized.startsWith('0')) {
      normalized = '221' + normalized.slice(1);
    } else if (normalized.startsWith('+221')) {
      normalized = normalized.slice(1);
    } else if (normalized.length === 9 && !normalized.startsWith('221')) {
      normalized = '221' + normalized;
    }
    return normalized;
  }
}
