import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '@prisma/client';
import { IPaymentStrategy, PaymentResult } from './payment-strategy.interface';

@Injectable()
export class OrangeMoneyStrategy implements IPaymentStrategy {
  private readonly logger = new Logger(OrangeMoneyStrategy.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string;
  private readonly merchantCode: string;
  private readonly merchantName: string;
  private readonly callbackUrl: string;

  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private configService: ConfigService) {
    this.clientId = this.configService.get<string>('ORANGE_MONEY_CLIENT_ID', '');
    this.clientSecret = this.configService.get<string>('ORANGE_MONEY_CLIENT_SECRET', '');
    const rawBaseUrl = this.configService.get<string>('ORANGE_MONEY_BASE_URL', 'https://api.orange-sonatel.com');
    this.baseUrl = rawBaseUrl.startsWith('http') ? rawBaseUrl : `https://${rawBaseUrl}`;
    this.merchantCode = this.configService.get<string>('ORANGE_MONEY_MERCHANT_CODE', '');
    this.merchantName = this.configService.get<string>('ORANGE_MONEY_MERCHANT_NAME', 'OFood');
    const appUrl = this.configService.get<string>('APP_URL', '');
    this.callbackUrl = `${appUrl}/payments/orange-money/callback`;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const response = await fetch(`${this.baseUrl}/oauth/v1/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials',
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Orange Money auth failed: ${response.status} - ${errorBody}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token as string;
    // Expire 30s avant pour éviter les edge cases
    this.tokenExpiresAt = Date.now() + (data.expires_in - 30) * 1000;

    return this.accessToken!;
  }

  async initiatePayment(
    amount: number,
    phone: string,
    provider: PaymentMethod,
  ): Promise<PaymentResult> {
    const token = await this.getAccessToken();

    const response = await fetch(`${this.baseUrl}/api/eWallet/v4/qrcode`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Callback-Url': this.callbackUrl,
      },
      body: JSON.stringify({
        code: this.merchantCode,
        name: this.merchantName,
        amount: {
          value: amount,
          unit: 'XOF',
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(`Orange Money QR code generation failed: ${response.status} - ${errorBody}`);
      return {
        success: false,
        pending: false,
        reference: '',
        message: `Échec Orange Money: ${response.status}`,
      };
    }

    const data = await response.json();
    const qrData = Array.isArray(data) ? data[0] : data;

    this.logger.log(`Orange Money QR code generated for ${amount} XOF`);

    return {
      success: true,
      pending: true,
      reference: qrData.transactionId || qrData.requestId || '',
      message: 'QR code généré. En attente du paiement Orange Money.',
      deepLink: qrData.deepLink || '',
      qrCode: qrData.qrCode || '',
    };
  }

  async verifyPayment(reference: string): Promise<PaymentResult> {
    const token = await this.getAccessToken();

    const response = await fetch(
      `${this.baseUrl}/api/eWallet/v1/transactions/${reference}/status`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(`Orange Money verify failed: ${response.status} - ${errorBody}`);
      return {
        success: false,
        pending: false,
        reference,
        message: `Vérification échouée: ${response.status}`,
      };
    }

    const data = await response.json();
    const status = data.status?.toUpperCase();

    if (status === 'SUCCESS' || status === 'ACCEPTED') {
      return {
        success: true,
        pending: false,
        reference,
        message: 'Paiement Orange Money confirmé',
      };
    }

    if (status === 'PENDING' || status === 'INITIATED' || status === 'PRE_INITIATED') {
      return {
        success: false,
        pending: true,
        reference,
        message: 'Paiement en cours de traitement',
      };
    }

    return {
      success: false,
      pending: false,
      reference,
      message: `Paiement échoué: ${status}`,
    };
  }
}
