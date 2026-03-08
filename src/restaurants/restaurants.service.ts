import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { QueryRestaurantsDto } from './dto/query-restaurants.dto';

@Injectable()
export class RestaurantsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async findAll(query: QueryRestaurantsDto) {
    const { lat, lng, radius = 1, isOpen } = query;

    if (lat !== undefined && lng !== undefined) {
      return this.findAllWithGeo(lat, lng, radius, isOpen);
    }

    const where: Record<string, unknown> = { isVerified: true };
    if (isOpen !== undefined) where.isOpen = isOpen;

    return this.prisma.restaurant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  private async findAllWithGeo(lat: number, lng: number, radius: number, isOpen?: boolean) {
    type RawRestaurant = {
      id: string; name: string; logoUrl: string; address: string;
      lat: number; lng: number; description: string; avgRating: number;
      totalRatings: number; isOpen: boolean; avgPrepTime: number;
      dailyCapacity: string; isVerified: boolean; distance: number;
    };

    let results: RawRestaurant[];

    if (isOpen !== undefined) {
      results = await this.prisma.$queryRaw<RawRestaurant[]>`
        SELECT *, (
          6371 * acos(LEAST(1.0, GREATEST(-1.0,
            cos(radians(${lat})) * cos(radians("lat")) *
            cos(radians("lng") - radians(${lng})) +
            sin(radians(${lat})) * sin(radians("lat"))
          )))
        ) AS distance
        FROM restaurants
        WHERE "isVerified" = true AND "isOpen" = ${isOpen}
        ORDER BY distance
      `;
    } else {
      results = await this.prisma.$queryRaw<RawRestaurant[]>`
        SELECT *, (
          6371 * acos(LEAST(1.0, GREATEST(-1.0,
            cos(radians(${lat})) * cos(radians("lat")) *
            cos(radians("lng") - radians(${lng})) +
            sin(radians(${lat})) * sin(radians("lat"))
          )))
        ) AS distance
        FROM restaurants
        WHERE "isVerified" = true
        ORDER BY distance
      `;
    }

    return results
      .filter((r) => r.distance <= radius)
      .map((r) => ({ ...r, distance: Math.round(r.distance * 100) / 100 }));
  }

  async findOne(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
        dishes: { where: { isAvailable: true }, orderBy: { category: 'asc' } },
        _count: { select: { ratings: true } },
      },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant non trouvé');
    }

    return restaurant;
  }

  async create(ownerId: string, dto: CreateRestaurantDto, logo?: Express.Multer.File) {
    const existing = await this.prisma.restaurant.findUnique({
      where: { ownerId },
    });
    if (existing) {
      throw new ConflictException('Vous avez déjà un restaurant');
    }

    if (logo) {
      dto.logoUrl = await this.storage.upload(logo, 'restaurants');
    }

    return this.prisma.restaurant.create({
      data: {
        ...dto,
        logoUrl: dto.logoUrl || '',
        avgPrepTime: dto.avgPrepTime ?? 20,
        ownerId,
      },
    });
  }

  async update(ownerId: string, id: string, dto: UpdateRestaurantDto, logo?: Express.Multer.File) {
    const restaurant = await this.ensureOwnership(ownerId, id);

    if (logo) {
      if (restaurant.logoUrl) {
        await this.storage.delete(restaurant.logoUrl).catch(() => {});
      }
      dto.logoUrl = await this.storage.upload(logo, 'restaurants');
    }

    return this.prisma.restaurant.update({
      where: { id: restaurant.id },
      data: dto,
    });
  }

  async getStats(ownerId: string, id: string) {
    const restaurant = await this.ensureOwnership(ownerId, id);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() - 7);
    const startOfMonth = new Date(startOfToday);
    startOfMonth.setDate(startOfToday.getDate() - 30);

    const deliveredStatuses = [OrderStatus.DELIVERED];

    const buildFilter = (since: Date) => ({
      where: {
        items: { some: { restaurantId: restaurant.id } },
        status: { in: deliveredStatuses },
        createdAt: { gte: since },
      },
    });

    const [today, week, month, total] = await Promise.all([
      this.prisma.order.aggregate({
        ...buildFilter(startOfToday),
        _count: true,
        _sum: { totalAmount: true },
      }),
      this.prisma.order.aggregate({
        ...buildFilter(startOfWeek),
        _count: true,
        _sum: { totalAmount: true },
      }),
      this.prisma.order.aggregate({
        ...buildFilter(startOfMonth),
        _count: true,
        _sum: { totalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: {
          items: { some: { restaurantId: restaurant.id } },
          status: { in: deliveredStatuses },
        },
        _count: true,
        _sum: { totalAmount: true },
      }),
    ]);

    return {
      today: { orders: today._count, revenue: today._sum.totalAmount || 0 },
      week: { orders: week._count, revenue: week._sum.totalAmount || 0 },
      month: { orders: month._count, revenue: month._sum.totalAmount || 0 },
      totalOrders: total._count,
      totalRevenue: total._sum.totalAmount || 0,
      avgRating: restaurant.avgRating,
      totalRatings: restaurant.totalRatings,
    };
  }

  async getAnalytics(ownerId: string, id: string) {
    const restaurant = await this.ensureOwnership(ownerId, id);

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    // Daily revenue for last 30 days
    const dailyRevenue = await this.prisma.$queryRaw<
      Array<{ day: string; orders: bigint; revenue: number }>
    >`
      SELECT
        TO_CHAR(o."createdAt", 'YYYY-MM-DD') AS day,
        COUNT(DISTINCT o.id) AS orders,
        COALESCE(SUM(oi.subtotal), 0) AS revenue
      FROM orders o
      JOIN order_items oi ON oi."orderId" = o.id
      WHERE oi."restaurantId" = ${restaurant.id}
        AND o.status = 'DELIVERED'
        AND o."createdAt" >= ${thirtyDaysAgo}
      GROUP BY day
      ORDER BY day ASC
    `;

    // Top dishes by quantity
    const topDishes = await this.prisma.$queryRaw<
      Array<{ dishId: string; name: string; quantity: bigint; revenue: number }>
    >`
      SELECT
        oi."dishId",
        d.name,
        SUM(oi.quantity) AS quantity,
        SUM(oi.subtotal) AS revenue
      FROM order_items oi
      JOIN dishes d ON d.id = oi."dishId"
      JOIN orders o ON o.id = oi."orderId"
      WHERE oi."restaurantId" = ${restaurant.id}
        AND o.status = 'DELIVERED'
      GROUP BY oi."dishId", d.name
      ORDER BY quantity DESC
      LIMIT 10
    `;

    // Revenue by payment method
    const byPaymentMethod = await this.prisma.$queryRaw<
      Array<{ method: string; orders: bigint; revenue: number }>
    >`
      SELECT
        COALESCE(o."paymentMethod", 'UNKNOWN') AS method,
        COUNT(DISTINCT o.id) AS orders,
        COALESCE(SUM(oi.subtotal), 0) AS revenue
      FROM orders o
      JOIN order_items oi ON oi."orderId" = o.id
      WHERE oi."restaurantId" = ${restaurant.id}
        AND o.status = 'DELIVERED'
      GROUP BY o."paymentMethod"
      ORDER BY revenue DESC
    `;

    // Orders by hour of day (peak hours)
    const byHour = await this.prisma.$queryRaw<
      Array<{ hour: number; orders: bigint }>
    >`
      SELECT
        EXTRACT(HOUR FROM o."createdAt") AS hour,
        COUNT(DISTINCT o.id) AS orders
      FROM orders o
      JOIN order_items oi ON oi."orderId" = o.id
      WHERE oi."restaurantId" = ${restaurant.id}
        AND o.status = 'DELIVERED'
      GROUP BY hour
      ORDER BY hour ASC
    `;

    return {
      dailyRevenue: dailyRevenue.map((d) => ({
        day: d.day,
        orders: Number(d.orders),
        revenue: Number(d.revenue),
      })),
      topDishes: topDishes.map((d) => ({
        dishId: d.dishId,
        name: d.name,
        quantity: Number(d.quantity),
        revenue: Number(d.revenue),
      })),
      byPaymentMethod: byPaymentMethod.map((d) => ({
        method: d.method,
        orders: Number(d.orders),
        revenue: Number(d.revenue),
      })),
      byHour: byHour.map((d) => ({
        hour: Number(d.hour),
        orders: Number(d.orders),
      })),
    };
  }

  async getWallet(ownerId: string, id: string) {
    const restaurant = await this.ensureOwnership(ownerId, id);

    const transactions = await this.prisma.transaction.findMany({
      where: { restaurantId: restaurant.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      walletBalance: restaurant.walletBalance,
      transactions,
    };
  }

  private async ensureOwnership(ownerId: string, restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant non trouvé');
    }

    if (restaurant.ownerId !== ownerId) {
      throw new ForbiddenException("Vous n'êtes pas le propriétaire de ce restaurant");
    }

    return restaurant;
  }
}
