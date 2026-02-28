import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { QueryRestaurantsDto } from './dto/query-restaurants.dto';

@Injectable()
export class RestaurantsService {
  constructor(private prisma: PrismaService) {}

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

  async create(ownerId: string, dto: CreateRestaurantDto) {
    const existing = await this.prisma.restaurant.findUnique({
      where: { ownerId },
    });
    if (existing) {
      throw new ConflictException('Vous avez déjà un restaurant');
    }

    return this.prisma.restaurant.create({
      data: {
        ...dto,
        avgPrepTime: dto.avgPrepTime ?? 20,
        ownerId,
      },
    });
  }

  async update(ownerId: string, id: string, dto: UpdateRestaurantDto) {
    const restaurant = await this.ensureOwnership(ownerId, id);

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
