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
  private readonly appBaseUrl: string;
  private readonly frontendBaseUrl: string;

  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private configService: ConfigService) {
    this.clientId = this.configService.get<string>('ORANGE_MONEY_CLIENT_ID', '');
    this.clientSecret = this.configService.get<string>('ORANGE_MONEY_CLIENT_SECRET', '');
    const rawBaseUrl = this.configService.get<string>('ORANGE_MONEY_BASE_URL', 'https://api.orange-sonatel.com');
    this.baseUrl = rawBaseUrl.startsWith('http') ? rawBaseUrl : `https://${rawBaseUrl}`;
    this.merchantCode = this.configService.get<string>('ORANGE_MONEY_MERCHANT_CODE', '');
    this.merchantName = this.configService.get<string>('ORANGE_MONEY_MERCHANT_NAME', 'OFood');
    this.appBaseUrl = this.configService.get<string>('APP_URL', '');
    this.frontendBaseUrl = this.configService.get<string>('FRONTEND_URL', '') || this.appBaseUrl;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const response = await fetch(`${this.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(`Orange Money auth failed: ${response.status} - ${errorBody}`);
      throw new Error(`Orange Money auth failed: ${response.status}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token as string;
    this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;

    this.logger.log('Token Orange Money obtenu');
    return this.accessToken!;
  }

  async initiatePayment(
    amount: number,
    phone: string,
    provider: PaymentMethod,
    orderId?: string,
  ): Promise<PaymentResult> {
    try {
      const token = await this.getAccessToken();

      const callbackSuccessUrl = `${this.frontendBaseUrl}/payment/success?orderId=${orderId}`;
      const callbackCancelUrl = `${this.frontendBaseUrl}/payment/cancelled?orderId=${orderId}`;

      const response = await fetch(`${this.baseUrl}/api/eWallet/v4/qrcode`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: this.merchantCode,
          name: this.merchantName,
          amount: {
            unit: 'XOF',
            value: Math.round(amount),
          },
          callbackSuccessUrl,
          callbackCancelUrl,
          reference: orderId || 'ofood',
          metadata: { orderId, source: 'ofood' },
          validity: 1800,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(`Orange Money QR code failed: ${response.status} - ${errorBody}`);

        if (response.status === 401) {
          this.accessToken = null;
          this.tokenExpiresAt = 0;
        }

        return {
          success: false,
          pending: false,
          reference: '',
          message: `Échec Orange Money: ${response.status}`,
        };
      }

      const data = await response.json();

      this.logger.log(`Orange Money QR code généré — qrId: ${data.qrId}, montant: ${amount} XOF`);

      return {
        success: true,
        pending: true,
        reference: data.qrId || '',
        message: 'En attente du paiement Orange Money.',
        deepLinks: {
          OM: data.deepLinks?.OM || data.deepLink || '',
          MAXIT: data.deepLinks?.MAXIT || '',
        },
        qrCode: data.qrCode || '',
      };
    } catch (error) {
      this.logger.error('Erreur initiation paiement Orange Money', error);
      return {
        success: false,
        pending: false,
        reference: '',
        message: 'Erreur technique Orange Money',
      };
    }
  }

  async registerCallback(): Promise<any> {
    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}/api/notification/v1/merchantcallback`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiKey: this.clientId,
        code: this.merchantCode,
        name: this.merchantName,
        callbackUrl: `${this.appBaseUrl}/payments/orange-money/callback`,
      }),
    });
    return response.json();
  }

  async verifyPayment(reference: string): Promise<PaymentResult> {
    try {
      const token = await this.getAccessToken();

      const response = await fetch(
        `${this.baseUrl}/api/eWallet/v4/qrcode/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
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
      const status = (data.status || '').toUpperCase();

      if (status === 'SUCCESS' || status === 'ACCEPTED') {
        return { success: true, pending: false, reference, message: 'Paiement Orange Money confirmé' };
      }

      if (status === 'PENDING' || status === 'INITIATED' || status === 'PRE_INITIATED') {
        return { success: false, pending: true, reference, message: 'Paiement en cours de traitement' };
      }

      return { success: false, pending: false, reference, message: `Paiement échoué: ${status}` };
    } catch (error) {
      this.logger.error('Erreur vérification paiement Orange Money', error);
      return { success: false, pending: false, reference, message: 'Erreur technique de vérification' };
    }
  }
}
