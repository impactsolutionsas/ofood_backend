import { PaymentMethod } from '@prisma/client';

export interface PaymentResult {
  success: boolean;
  pending: boolean;
  reference: string;
  message: string;
  deepLinks?: {
    OM?: string;
    MAXIT?: string;
  };
  qrCode?: string;
}

export interface IPaymentStrategy {
  initiatePayment(
    amount: number,
    phone: string,
    provider: PaymentMethod,
    orderId?: string,
  ): Promise<PaymentResult>;

  verifyPayment(reference: string): Promise<PaymentResult>;
}
