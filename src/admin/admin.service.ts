import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { OrderStatus, TransactionStatus, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersGateway } from '../orders/orders.gateway';
import { SmsService } from '../notifications/sms.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private ordersGateway: OrdersGateway,
    private smsService: SmsService,
  ) {}

  async getDashboard() {
    const [
      totalUsers,
      totalRestaurants,
      verifiedRestaurants,
      totalOrders,
      deliveredOrders,
      successTransactions,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.restaurant.count(),
      this.prisma.restaurant.count({ where: { isVerified: true } }),
      this.prisma.order.count(),
      this.prisma.order.aggregate({
        where: { status: OrderStatus.DELIVERED },
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.transaction.count({
        where: { status: TransactionStatus.SUCCESS },
      }),
    ]);

    return {
      totalUsers,
      totalRestaurants,
      verifiedRestaurants,
      totalOrders,
      deliveredOrders: deliveredOrders._count,
      totalRevenue: deliveredOrders._sum.totalAmount || 0,
      totalTransactions: successTransactions,
    };
  }

  async getUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRestaurants() {
    return this.prisma.restaurant.findMany({
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, phone: true } },
        _count: { select: { dishes: true, ratings: true, orderItems: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async toggleVerifyRestaurant(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant non trouvé');
    }

    return this.prisma.restaurant.update({
      where: { id },
      data: { isVerified: !restaurant.isVerified },
    });
  }

  async updateRestaurant(id: string, data: { name?: string; address?: string; description?: string; avgPrepTime?: number; dailyCapacity?: string }) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant non trouvé');
    }

    return this.prisma.restaurant.update({
      where: { id },
      data,
    });
  }

  async toggleRestaurantActive(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant non trouvé');
    }

    return this.prisma.restaurant.update({
      where: { id },
      data: { isOpen: !restaurant.isOpen },
    });
  }

  async getOrders() {
    return this.prisma.order.findMany({
      include: {
        user: { select: { id: true, firstName: true, lastName: true, phone: true } },
        items: {
          include: {
            dish: { select: { id: true, name: true } },
            restaurant: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTransactions(status?: TransactionStatus) {
    return this.prisma.transaction.findMany({
      where: status ? { status } : undefined,
      include: {
        order: {
          select: {
            id: true,
            status: true,
            totalAmount: true,
            user: { select: { id: true, firstName: true, lastName: true, phone: true } },
          },
        },
        restaurant: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async manuallyValidateTransaction(transactionId: string, adminNote?: string) {
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

    if (transaction.status === TransactionStatus.SUCCESS) {
      throw new BadRequestException('Transaction déjà validée');
    }

    if (!transaction.order) {
      throw new BadRequestException('Aucune commande associée à cette transaction');
    }

    const order = transaction.order;
    const note = adminNote || 'Validé manuellement par un administrateur';

    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: transactionId },
        data: { status: TransactionStatus.SUCCESS, note },
      });

      const current = await tx.order.findUnique({
        where: { id: order.id },
        select: { status: true },
      });

      if (current?.status === OrderStatus.PAID) return;

      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.PAID, paymentStatus: 'PAID' },
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
            note: `Paiement commande #${order.id.slice(0, 8)} (validation admin)`,
          },
        });
      }
    });

    // Notifier en temps réel client + restaurants
    const restaurantIds = [...new Set(order.items.map((i) => i.restaurantId))] as string[];
    for (const restaurantId of restaurantIds) {
      this.ordersGateway.notifyStatusChange(restaurantId, order.userId, order.id, OrderStatus.PAID);

      const restaurant = order.items.find((i) => i.restaurantId === restaurantId)?.restaurant;
      if (restaurant) {
        this.prisma.user
          .findUnique({ where: { id: restaurant.ownerId }, select: { phone: true } })
          .then((owner) => {
            if (owner) {
              this.smsService
                .sendSms(owner.phone, `Paiement validé pour une commande sur ${restaurant.name} !`)
                .catch(() => {});
            }
          });
      }
    }

    // Notifier le client par SMS
    this.prisma.user
      .findUnique({ where: { id: order.userId }, select: { phone: true } })
      .then((user) => {
        if (user) {
          this.smsService
            .sendSms(user.phone, `Votre paiement a été validé. Votre commande est en cours de préparation !`)
            .catch(() => {});
        }
      });

    return { success: true, transactionId, message: note };
  }
}
