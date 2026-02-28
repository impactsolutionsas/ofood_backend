import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  OrderStatus,
  WalletTransactionType,
  WalletTransactionStatus,
  TransactionType,
  TransactionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RechargeWalletDto } from './dto/recharge-wallet.dto';
import { WalletPaymentDto } from './dto/wallet-payment.dto';

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  async getMyWallet(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet non trouvé');
    }

    return {
      id: wallet.id,
      balance: wallet.balance,
      frozenAmount: wallet.frozenAmount,
      availableBalance: wallet.balance - wallet.frozenAmount,
      recentTransactions: wallet.transactions,
    };
  }

  async recharge(userId: string, dto: RechargeWalletDto) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet non trouvé');
    }

    // Simuler le paiement mobile money (mock)
    const reference = `RCH-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const result = await this.prisma.$transaction(async (tx) => {
      const balanceBefore = wallet.balance;
      const balanceAfter = balanceBefore + dto.amount;

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.RECHARGE,
          amount: dto.amount,
          balanceBefore,
          balanceAfter,
          status: WalletTransactionStatus.SUCCESS,
          reference,
          note: `Recharge via ${dto.paymentMethod} (${dto.phoneNumber})`,
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      return { transaction, balanceAfter };
    });

    return {
      message: 'Recharge effectuée avec succès',
      newBalance: result.balanceAfter,
      transaction: result.transaction,
    };
  }

  async getTransactions(userId: string, page = 1, limit = 20) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet non trouvé');
    }

    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.walletTransaction.count({
        where: { walletId: wallet.id },
      }),
    ]);

    return {
      transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async payWithWallet(userId: string, dto: WalletPaymentDto) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet non trouvé');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        items: {
          include: {
            restaurant: { select: { id: true, ownerId: true } },
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

    const availableBalance = wallet.balance - wallet.frozenAmount;
    if (availableBalance < order.totalAmount) {
      throw new BadRequestException(
        `Solde insuffisant. Disponible : ${availableBalance} FCFA, requis : ${order.totalAmount} FCFA`,
      );
    }

    const reference = `WPY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const result = await this.prisma.$transaction(async (tx) => {
      const balanceBefore = wallet.balance;
      const balanceAfter = balanceBefore - order.totalAmount;

      // Débiter le wallet
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      // Créer la transaction wallet
      const walletTx = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          orderId: order.id,
          type: WalletTransactionType.DEBIT_ORDER,
          amount: order.totalAmount,
          balanceBefore,
          balanceAfter,
          status: WalletTransactionStatus.SUCCESS,
          reference,
          note: `Paiement commande #${order.id.slice(0, 8)}`,
        },
      });

      // Mettre à jour la commande
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.PAID,
          paymentStatus: 'PAID',
          paidFromWallet: true,
          walletAmountUsed: order.totalAmount,
          paymentRef: reference,
        },
      });

      // Créditer les restaurants
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
            note: `Paiement wallet commande #${order.id.slice(0, 8)}`,
          },
        });
      }

      return { walletTx, balanceAfter };
    });

    return {
      message: 'Paiement effectué avec succès',
      newBalance: result.balanceAfter,
      transaction: result.walletTx,
    };
  }
}
