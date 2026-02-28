import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { OrderStatus, Role, TransactionType, TransactionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../notifications/sms.service';
import { OrdersGateway } from '../orders/orders.gateway';
import { IPaymentStrategy } from './strategies/payment-strategy.interface';
import { MockPaymentStrategy } from './strategies/mock-payment.strategy';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';

@Injectable()
export class PaymentsService {
  private readonly strategy: IPaymentStrategy;

  constructor(
    private prisma: PrismaService,
    private smsService: SmsService,
    private ordersGateway: OrdersGateway,
    mockStrategy: MockPaymentStrategy,
  ) {
    // Pour l'instant, toujours le mock. Plus tard on pourra ajouter Wave/OM strategies
    this.strategy = mockStrategy;
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
    const result = await this.strategy.initiatePayment(
      order.totalAmount,
      dto.phoneNumber,
      dto.paymentMethod,
    );

    if (!result.success) {
      // Créer transaction échouée
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

    // Paiement réussi → transaction atomique
    const transaction = await this.prisma.$transaction(async (tx) => {
      // Créer la transaction
      const paymentTx = await tx.transaction.create({
        data: {
          orderId: order.id,
          type: TransactionType.CREDIT,
          amount: order.totalAmount,
          mobileProvider: dto.paymentMethod,
          phoneNumber: dto.phoneNumber,
          reference: result.reference,
          status: TransactionStatus.SUCCESS,
          note: result.message,
        },
      });

      // Mettre à jour la commande
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.PAID,
          paymentStatus: 'PAID',
          paymentMethod: dto.paymentMethod,
          paymentRef: result.reference,
        },
      });

      // Créditer le wallet de chaque restaurant
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

        // Transaction de crédit pour le restaurant
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

    // Notifications WebSocket + SMS
    const restaurantIds = [...new Set(order.items.map((i) => i.restaurantId))];
    for (const restaurantId of restaurantIds) {
      this.ordersGateway.notifyStatusChange(
        restaurantId,
        userId,
        order.id,
        OrderStatus.PAID,
      );

      const restaurant = order.items.find((i) => i.restaurantId === restaurantId)?.restaurant;
      if (restaurant) {
        const owner = await this.prisma.user.findUnique({
          where: { id: restaurant.ownerId },
          select: { phone: true },
        });
        if (owner) {
          this.smsService
            .sendSms(owner.phone, `Paiement reçu pour une commande sur ${restaurant.name} !`)
            .catch(() => {});
        }
      }
    }

    return transaction;
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

    const result = await this.strategy.verifyPayment(dto.reference);

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
