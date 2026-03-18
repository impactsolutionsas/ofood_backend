import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, TransactionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

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

  async getTransactions() {
    return this.prisma.transaction.findMany({
      include: {
        order: { select: { id: true, status: true, totalAmount: true } },
        restaurant: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
