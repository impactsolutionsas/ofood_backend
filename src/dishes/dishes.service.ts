import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDishDto } from './dto/create-dish.dto';
import { UpdateDishDto } from './dto/update-dish.dto';
import { QueryDishesDto } from './dto/query-dishes.dto';

@Injectable()
export class DishesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryDishesDto) {
    const { lat, lng, radius = 1, category, restaurantId } = query;

    // Geo filter: find restaurants in range first, then their dishes
    if (lat !== undefined && lng !== undefined) {
      const nearbyRestaurantIds = await this.prisma.$queryRaw<
        Array<{ id: string }>
      >`
        SELECT id FROM restaurants
        WHERE "isVerified" = true AND (
          6371 * acos(LEAST(1.0, GREATEST(-1.0,
            cos(radians(${lat})) * cos(radians("lat")) *
            cos(radians("lng") - radians(${lng})) +
            sin(radians(${lat})) * sin(radians("lat"))
          )))
        ) <= ${radius}
      `;

      const ids = nearbyRestaurantIds.map((r) => r.id);
      if (ids.length === 0) return [];

      const where: Prisma.DishWhereInput = {
        restaurantId: { in: ids },
        isAvailable: true,
      };
      if (category) where.category = category;

      return this.prisma.dish.findMany({
        where,
        include: {
          restaurant: { select: { id: true, name: true, address: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // No geo filter
    const where: Prisma.DishWhereInput = { isAvailable: true };
    if (category) where.category = category;
    if (restaurantId) where.restaurantId = restaurantId;

    return this.prisma.dish.findMany({
      where,
      include: {
        restaurant: { select: { id: true, name: true, address: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const dish = await this.prisma.dish.findUnique({
      where: { id },
      include: {
        restaurant: {
          select: { id: true, name: true, address: true, avgRating: true },
        },
      },
    });

    if (!dish) {
      throw new NotFoundException('Plat non trouvé');
    }

    return dish;
  }

  async create(ownerId: string, restaurantId: string, dto: CreateDishDto) {
    await this.ensureRestaurantOwnership(ownerId, restaurantId);

    return this.prisma.dish.create({
      data: {
        ...dto,
        isAvailable: dto.isAvailable ?? true,
        restaurantId,
      },
    });
  }

  async update(ownerId: string, id: string, dto: UpdateDishDto) {
    const dish = await this.findDishWithOwner(id);
    if (dish.restaurant.ownerId !== ownerId) {
      throw new ForbiddenException("Vous n'êtes pas le propriétaire de ce plat");
    }

    return this.prisma.dish.update({
      where: { id },
      data: dto,
    });
  }

  async remove(ownerId: string, id: string) {
    const dish = await this.findDishWithOwner(id);
    if (dish.restaurant.ownerId !== ownerId) {
      throw new ForbiddenException("Vous n'êtes pas le propriétaire de ce plat");
    }

    await this.prisma.dish.delete({ where: { id } });
    return { message: 'Plat supprimé' };
  }

  private async ensureRestaurantOwnership(ownerId: string, restaurantId: string) {
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

  private async findDishWithOwner(id: string) {
    const dish = await this.prisma.dish.findUnique({
      where: { id },
      include: { restaurant: { select: { ownerId: true } } },
    });

    if (!dish) {
      throw new NotFoundException('Plat non trouvé');
    }

    return dish;
  }
}
