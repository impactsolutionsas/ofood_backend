import { PaymentMethod } from '@prisma/client';

export interface PaymentResult {
  success: boolean;
  reference: string;
  message: string;
}

export interface IPaymentStrategy {
  initiatePayment(
    amount: number,
    phone: string,
    provider: PaymentMethod,
  ): Promise<PaymentResult>;

  verifyPayment(reference: string): Promise<PaymentResult>;
}
