import {
  Injectable,
  Logger,
  OnModuleInit,
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
export class PaymentsService implements OnModuleInit {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly strategies: Map<PaymentMethod, IPaymentStrategy>;

  constructor(
    private prisma: PrismaService,
    private smsService: SmsService,
    private ordersGateway: OrdersGateway,
    mockStrategy: MockPaymentStrategy,
    private orangeMoneyStrategy: OrangeMoneyStrategy,
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

  async onModuleInit() {
    // Register Orange Money webhook URL once on startup (idempotent on OM side)
    try {
      await this.orangeMoneyStrategy.registerCallback();
      this.logger.log('Callback Orange Money enregistré avec succès');
    } catch (e) {
      this.logger.warn(`Impossible d'enregistrer le callback Orange Money: ${e?.message || e}`);
    }
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

    if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.AWAITING_PAYMENT) {
      throw new BadRequestException(
        `Impossible de payer une commande avec le statut : ${order.status}`,
      );
    }

    // Si retry depuis AWAITING_PAYMENT, annuler l'ancienne transaction PENDING
    if (order.status === OrderStatus.AWAITING_PAYMENT) {
      await this.prisma.transaction.updateMany({
        where: { orderId: order.id, status: TransactionStatus.PENDING },
        data: { status: TransactionStatus.FAILED, note: 'Annulé par nouveau paiement' },
      });
    }

    // Appeler le strategy de paiement
    const strategy = this.getStrategy(dto.paymentMethod);
    const result = await strategy.initiatePayment(
      order.totalAmount,
      dto.phoneNumber || '',
      dto.paymentMethod,
      order.id,
    );

    //console.log('Résultat du paiement:', result);

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
          status: OrderStatus.AWAITING_PAYMENT,
          paymentMethod: dto.paymentMethod,
          paymentRef: result.reference,
        },
      });

      return {
        transaction: pendingTx,
        deepLinks: result.deepLinks,
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

  async handleOrangeMoneyRedirectCallback(orderId: string, type: 'success' | 'cancel', queryData: any) {
    this.logger.log(`Orange Money redirect callback (${type}) pour commande ${orderId} — query: ${JSON.stringify(queryData)}`);

    const transaction = await this.prisma.transaction.findFirst({
      where: { orderId, status: TransactionStatus.PENDING, mobileProvider: PaymentMethod.ORANGE_MONEY },
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

    if (!transaction || !transaction.order) {
      this.logger.warn(`Aucune transaction PENDING trouvée pour commande ${orderId}`);
      return;
    }

    // Si déjà traitée, ignorer
    if (transaction.order.status === OrderStatus.PAID) {
      this.logger.log(`Commande ${orderId} déjà PAID, callback ignoré`);
      return;
    }

    if (type === 'cancel') {
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: TransactionStatus.FAILED, note: 'Paiement annulé par l\'utilisateur' },
      });
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.PENDING },
      });
      this.logger.log(`Paiement annulé pour commande ${orderId}`);
      return;
    }

    // type === 'success' — vérifier le statut réel via l'API Orange Money
    if (transaction.reference) {
      try {
        const verifyResult = await this.orangeMoneyStrategy.verifyPayment(transaction.reference);
        this.logger.log(`Vérification OM pour ${transaction.reference}: success=${verifyResult.success}, pending=${verifyResult.pending}`);

        if (verifyResult.success) {
          await this.prisma.transaction.update({
            where: { id: transaction.id },
            data: { status: TransactionStatus.SUCCESS, note: 'Confirmé via callback success + vérification API' },
          });
          await this.confirmPaymentFromCallback(transaction.order);
          this.logger.log(`Paiement confirmé pour commande ${orderId} via redirect callback`);
          return;
        }

        if (verifyResult.pending) {
          // Le paiement est encore en cours — le webhook finira le traitement
          this.logger.log(`Paiement encore en cours pour commande ${orderId}, attente webhook`);
          return;
        }

        // Échec confirmé par l'API
        await this.prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: TransactionStatus.FAILED, note: `Échec vérifié: ${verifyResult.message}` },
        });
        await this.prisma.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.PENDING },
        });
      } catch (error) {
        this.logger.error(`Erreur vérification OM pour commande ${orderId}`, error);
        // En cas d'erreur de vérification, on laisse le webhook gérer
      }
    }
  }

  async handleOrangeMoneyCallback(payload: any) {
    this.logger.log(`Orange Money webhook reçu: ${JSON.stringify(payload)}`);

    // Extraire la référence — Orange Money peut envoyer sous différents noms
    const reference = payload.qrId || payload.transactionId || payload.requestId
      || payload.notif?.qrId || payload.notif?.transactionId;
    if (!reference) {
      this.logger.warn('Webhook Orange Money sans référence de transaction');
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

    // Idempotency: commande déjà payée
    if (existingTx.order.status === OrderStatus.PAID) {
      this.logger.log(`Commande ${existingTx.orderId} déjà PAID, webhook ignoré`);
      return { received: true };
    }

    // Extraire le statut — peut être à différents niveaux du payload
    const rawStatus = payload.status || payload.notif?.status || payload.paymentStatus || '';
    const status = rawStatus.toUpperCase();

    if (status === 'SUCCESS' || status === 'ACCEPTED' || status === 'SUCCESSFULL') {
      await this.prisma.transaction.update({
        where: { id: existingTx.id },
        data: { status: TransactionStatus.SUCCESS, note: 'Paiement Orange Money confirmé via webhook' },
      });

      await this.confirmPaymentFromCallback(existingTx.order);
      this.logger.log(`Paiement Orange Money confirmé pour commande ${existingTx.orderId}`);
    } else if (status === 'FAILED' || status === 'CANCELLED' || status === 'REJECTED' || status === 'EXPIRED') {
      await this.prisma.transaction.update({
        where: { id: existingTx.id },
        data: { status: TransactionStatus.FAILED, note: `Paiement échoué: ${status}` },
      });

      if (existingTx.orderId) {
        await this.prisma.order.update({
          where: { id: existingTx.orderId },
          data: { status: OrderStatus.PENDING },
        });
      }

      this.logger.warn(`Paiement Orange Money échoué (${status}) pour commande ${existingTx.orderId}`);
    } else {
      // Statut inconnu ou absent — vérifier activement via l'API
      this.logger.warn(`Webhook avec statut inconnu "${rawStatus}" pour ref ${reference}, vérification active`);
      try {
        const verifyResult = await this.orangeMoneyStrategy.verifyPayment(reference);
        if (verifyResult.success) {
          await this.prisma.transaction.update({
            where: { id: existingTx.id },
            data: { status: TransactionStatus.SUCCESS, note: 'Confirmé via webhook + vérification API' },
          });
          await this.confirmPaymentFromCallback(existingTx.order);
          this.logger.log(`Paiement confirmé par vérification API pour commande ${existingTx.orderId}`);
        } else if (!verifyResult.pending) {
          await this.prisma.transaction.update({
            where: { id: existingTx.id },
            data: { status: TransactionStatus.FAILED, note: `Échec vérifié: ${verifyResult.message}` },
          });
          if (existingTx.orderId) {
            await this.prisma.order.update({
              where: { id: existingTx.orderId },
              data: { status: OrderStatus.PENDING },
            });
          }
        }
      } catch (error) {
        this.logger.error(`Erreur vérification active pour ref ${reference}`, error);
      }
    }

    return { received: true };
  }

  private async confirmPaymentFromCallback(order: any) {
    // Idempotency: skip if already processed
    if (order.status === OrderStatus.PAID) {
      this.logger.log(`Order ${order.id} already PAID, skipping wallet credit`);
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id: order.id },
        select: { status: true },
      });
      if (current?.status === OrderStatus.PAID) return;

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

    if (!transaction) {
      throw new NotFoundException('Transaction non trouvée');
    }

    if (transaction.order && transaction.order.userId !== userId) {
      throw new ForbiddenException("Cette transaction ne vous concerne pas");
    }

    // Si la transaction est deja confirmee (par callback ou verification precedente), retourner directement
    if (transaction.status === TransactionStatus.SUCCESS) {
      return {
        transactionId: transaction.id,
        status: TransactionStatus.SUCCESS,
        verified: true,
        message: 'Paiement deja confirme',
      };
    }

    // Si la transaction a echoue, pas besoin de re-verifier
    if (transaction.status === TransactionStatus.FAILED) {
      return {
        transactionId: transaction.id,
        status: TransactionStatus.FAILED,
        verified: false,
        message: 'Paiement echoue',
      };
    }

    if (!transaction.mobileProvider) {
      throw new BadRequestException('Méthode de paiement non définie pour cette transaction');
    }

    // Verifier aussi si la commande est deja payee (callback recu entre-temps)
    if (transaction.order && transaction.order.status === OrderStatus.PAID) {
      // Mettre a jour la transaction si elle est encore PENDING
      if (transaction.status === TransactionStatus.PENDING) {
        await this.prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: TransactionStatus.SUCCESS, note: 'Confirme via statut commande' },
        });
      }
      return {
        transactionId: transaction.id,
        status: TransactionStatus.SUCCESS,
        verified: true,
        message: 'Paiement confirme',
      };
    }

    const strategy = this.getStrategy(transaction.mobileProvider);
    const result = await strategy.verifyPayment(dto.reference);

    // Auto-confirmer si la vérification retourne success et la transaction est encore PENDING
    if (result.success && transaction.status === TransactionStatus.PENDING && transaction.order) {
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: TransactionStatus.SUCCESS, note: 'Confirmé par vérification' },
      });
      await this.confirmPaymentFromCallback(transaction.order);
    }

    return {
      transactionId: transaction.id,
      status: result.success ? TransactionStatus.SUCCESS : transaction.status,
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
