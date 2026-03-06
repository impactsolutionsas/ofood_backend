import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { OrderStatus, PaymentMethod, Role, TransactionType, TransactionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../notifications/sms.service';
import { OrdersGateway } from '../orders/orders.gateway';
import { IPaymentStrategy } from './strategies/payment-strategy.interface';
import { MockPaymentStrategy } from './strategies/mock-payment.strategy';
import { OrangeMoneyStrategy } from './strategies/orange-money.strategy';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly strategies: Map<PaymentMethod, IPaymentStrategy>;

  constructor(
    private prisma: PrismaService,
    private smsService: SmsService,
    private ordersGateway: OrdersGateway,
    mockStrategy: MockPaymentStrategy,
    orangeMoneyStrategy: OrangeMoneyStrategy,
  ) {
    this.strategies = new Map<PaymentMethod, IPaymentStrategy>([
      [PaymentMethod.ORANGE_MONEY, orangeMoneyStrategy],
      [PaymentMethod.WAVE, mockStrategy],
      [PaymentMethod.FREE_MONEY, mockStrategy],
    ]);
  }

  private getStrategy(method: PaymentMethod): IPaymentStrategy {
    const strategy = this.strategies.get(method);
    if (!strategy) {
      throw new BadRequestException(`Méthode de paiement non supportée: ${method}`);
    }
    return strategy;
  }

  async initiatePayment(userId: string, dto: InitiatePaymentDto) {
    // Vérifier commande
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        items: {
          include: {
            restaurant: { select: { id: true, name: true, ownerId: true } },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Commande non trouvée');
    }

    if (order.userId !== userId) {
      throw new ForbiddenException("Cette commande ne vous appartient pas");
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        `Impossible de payer une commande avec le statut : ${order.status}`,
      );
    }

    // Appeler le strategy de paiement
    const strategy = this.getStrategy(dto.paymentMethod);
    const result = await strategy.initiatePayment(
      order.totalAmount,
      dto.phoneNumber || '',
      dto.paymentMethod,
    );

    if (!result.success) {
      const failedTx = await this.prisma.transaction.create({
        data: {
          orderId: order.id,
          type: TransactionType.CREDIT,
          amount: order.totalAmount,
          mobileProvider: dto.paymentMethod,
          phoneNumber: dto.phoneNumber,
          reference: result.reference,
          status: TransactionStatus.FAILED,
          note: result.message,
        },
      });
      return failedTx;
    }

    // Paiement asynchrone (Orange Money) → PENDING
    if (result.pending) {
      const pendingTx = await this.prisma.transaction.create({
        data: {
          orderId: order.id,
          type: TransactionType.CREDIT,
          amount: order.totalAmount,
          mobileProvider: dto.paymentMethod,
          phoneNumber: dto.phoneNumber,
          reference: result.reference,
          status: TransactionStatus.PENDING,
          note: result.message,
        },
      });

      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          paymentMethod: dto.paymentMethod,
          paymentRef: result.reference,
        },
      });

      return {
        transaction: pendingTx,
        deepLink: result.deepLink,
        qrCode: result.qrCode,
        message: result.message,
      };
    }

    // Paiement synchrone (Mock/Wave/FreeMoney) → SUCCESS immédiat
    const transaction = await this.confirmPayment(order, dto, result.reference, result.message);
    return transaction;
  }

  private async confirmPayment(
    order: any,
    dto: { paymentMethod: PaymentMethod; phoneNumber?: string },
    reference: string,
    note: string,
  ) {
    const transaction = await this.prisma.$transaction(async (tx) => {
      const paymentTx = await tx.transaction.create({
        data: {
          orderId: order.id,
          type: TransactionType.CREDIT,
          amount: order.totalAmount,
          mobileProvider: dto.paymentMethod,
          phoneNumber: dto.phoneNumber,
          reference,
          status: TransactionStatus.SUCCESS,
          note,
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.PAID,
          paymentStatus: 'PAID',
          paymentMethod: dto.paymentMethod,
          paymentRef: reference,
        },
      });

      const restaurantAmounts = new Map<string, number>();
      for (const item of order.items) {
        const current = restaurantAmounts.get(item.restaurantId) || 0;
        restaurantAmounts.set(item.restaurantId, current + item.subtotal);
      }

      for (const [restaurantId, amount] of restaurantAmounts) {
        await tx.restaurant.update({
          where: { id: restaurantId },
          data: { walletBalance: { increment: amount } },
        });

        await tx.transaction.create({
          data: {
            restaurantId,
            orderId: order.id,
            type: TransactionType.CREDIT,
            amount,
            status: TransactionStatus.SUCCESS,
            note: `Paiement commande #${order.id.slice(0, 8)}`,
          },
        });
      }

      return paymentTx;
    });

    this.sendPaymentNotifications(order);
    return transaction;
  }

  async handleOrangeMoneyCallback(payload: any) {
    this.logger.log(`Orange Money callback reçu: ${JSON.stringify(payload)}`);

    const reference = payload.transactionId || payload.requestId;
    if (!reference) {
      this.logger.warn('Callback Orange Money sans référence de transaction');
      return { received: true };
    }

    const existingTx = await this.prisma.transaction.findFirst({
      where: { reference, status: TransactionStatus.PENDING },
      include: {
        order: {
          include: {
            items: {
              include: {
                restaurant: { select: { id: true, name: true, ownerId: true } },
              },
            },
          },
        },
      },
    });

    if (!existingTx || !existingTx.order) {
      this.logger.warn(`Transaction PENDING introuvable pour ref: ${reference}`);
      return { received: true };
    }

    const status = (payload.status || '').toUpperCase();

    if (status === 'SUCCESS' || status === 'ACCEPTED') {
      await this.prisma.transaction.update({
        where: { id: existingTx.id },
        data: { status: TransactionStatus.SUCCESS, note: 'Paiement Orange Money confirmé' },
      });

      await this.confirmPaymentFromCallback(existingTx.order);
      this.logger.log(`Paiement Orange Money confirmé pour commande ${existingTx.orderId}`);
    } else if (status === 'FAILED' || status === 'CANCELLED' || status === 'REJECTED') {
      await this.prisma.transaction.update({
        where: { id: existingTx.id },
        data: { status: TransactionStatus.FAILED, note: `Paiement échoué: ${status}` },
      });
      this.logger.warn(`Paiement Orange Money échoué (${status}) pour commande ${existingTx.orderId}`);
    }

    return { received: true };
  }

  private async confirmPaymentFromCallback(order: any) {
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.PAID,
          paymentStatus: 'PAID',
        },
      });

      const restaurantAmounts = new Map<string, number>();
      for (const item of order.items) {
        const current = restaurantAmounts.get(item.restaurantId) || 0;
        restaurantAmounts.set(item.restaurantId, current + item.subtotal);
      }

      for (const [restaurantId, amount] of restaurantAmounts) {
        await tx.restaurant.update({
          where: { id: restaurantId },
          data: { walletBalance: { increment: amount } },
        });

        await tx.transaction.create({
          data: {
            restaurantId,
            orderId: order.id,
            type: TransactionType.CREDIT,
            amount,
            status: TransactionStatus.SUCCESS,
            note: `Paiement commande #${order.id.slice(0, 8)}`,
          },
        });
      }
    });

    this.sendPaymentNotifications(order);
  }

  private sendPaymentNotifications(order: any) {
    const restaurantIds = [...new Set(order.items.map((i: any) => i.restaurantId))] as string[];
    for (const restaurantId of restaurantIds) {
      this.ordersGateway.notifyStatusChange(
        restaurantId,
        order.userId,
        order.id,
        OrderStatus.PAID,
      );

      const restaurant = order.items.find((i) => i.restaurantId === restaurantId)?.restaurant;
      if (restaurant) {
        this.prisma.user
          .findUnique({ where: { id: restaurant.ownerId }, select: { phone: true } })
          .then((owner) => {
            if (owner) {
              this.smsService
                .sendSms(owner.phone, `Paiement reçu pour une commande sur ${restaurant.name} !`)
                .catch(() => {});
            }
          });
      }
    }
  }

  async verifyPayment(userId: string, transactionId: string, dto: VerifyPaymentDto) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { order: { select: { userId: true } } },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction non trouvée');
    }

    if (transaction.order && transaction.order.userId !== userId) {
      throw new ForbiddenException("Cette transaction ne vous concerne pas");
    }

    if (!transaction.mobileProvider) {
      throw new BadRequestException('Méthode de paiement non définie pour cette transaction');
    }
    const strategy = this.getStrategy(transaction.mobileProvider);
    const result = await strategy.verifyPayment(dto.reference);

    return {
      transactionId: transaction.id,
      status: transaction.status,
      verified: result.success,
      message: result.message,
    };
  }

  async getOrderTransactions(userId: string, role: Role, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: { restaurant: { select: { ownerId: true } } },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Commande non trouvée');
    }

    // Contrôle d'accès
    if (role === Role.CLIENT && order.userId !== userId) {
      throw new ForbiddenException("Vous n'avez pas accès à cette commande");
    }

    if (role === Role.RESTAURANT_OWNER) {
      const hasAccess = order.items.some((i) => i.restaurant.ownerId === userId);
      if (!hasAccess) {
        throw new ForbiddenException("Vous n'avez pas accès à cette commande");
      }
    }

    return this.prisma.transaction.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
