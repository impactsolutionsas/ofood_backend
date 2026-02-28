import { Injectable, Logger } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { randomUUID } from 'crypto';
import { IPaymentStrategy, PaymentResult } from './payment-strategy.interface';

@Injectable()
export class MockPaymentStrategy implements IPaymentStrategy {
  private readonly logger = new Logger(MockPaymentStrategy.name);

  async initiatePayment(
    amount: number,
    phone: string,
    provider: PaymentMethod,
  ): Promise<PaymentResult> {
    const reference = `MOCK-${randomUUID().slice(0, 8).toUpperCase()}`;

    this.logger.log(
      `[MOCK] Paiement ${provider} de ${amount} FCFA via ${phone} → ref: ${reference}`,
    );

    return {
      success: true,
      reference,
      message: `Paiement ${provider} simulé avec succès`,
    };
  }

  async verifyPayment(reference: string): Promise<PaymentResult> {
    this.logger.log(`[MOCK] Vérification paiement ref: ${reference} → OK`);

    return {
      success: true,
      reference,
      message: 'Paiement vérifié (mock)',
    };
  }
}
