import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ISmsStrategy } from './sms-strategy.interface';

const TERMII_BASE_URL = 'https://api.ng.termii.com';

@Injectable()
export class TermiiStrategy implements ISmsStrategy {
  private readonly apiKey: string;
  private readonly senderId: string;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('TERMII_API_KEY', '');
    this.senderId = this.configService.get<string>('TERMII_SENDER_ID', 'OFood');
    this.baseUrl =
      this.configService.get<string>('TERMII_BASE_URL', TERMII_BASE_URL);
  }

  async sendSms(phone: string, message: string): Promise<void> {
    const normalizedPhone = this.normalizePhone(phone);

    const response = await fetch(`${this.baseUrl}/api/sms/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        to: normalizedPhone,
        from: this.senderId,
        sms: message,
        type: 'plain',
        channel: 'dnd',
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Termii SMS failed: ${response.status} - ${errorBody}`,
      );
    }
  }

  private normalizePhone(phone: string): string {
    let normalized = phone.replace(/\D/g, '');
    if (normalized.startsWith('0')) {
      normalized = '221' + normalized.slice(1);
    } else if (normalized.startsWith('221')) {
      normalized = normalized;
    } else if (normalized.startsWith('+221')) {
      normalized = normalized.slice(1);
    } else if (normalized.length === 9 && !normalized.startsWith('221')) {
      normalized = '221' + normalized;
    }
    return normalized;
  }
}
