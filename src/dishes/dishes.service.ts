import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DayOfWeek, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateDishDto } from './dto/create-dish.dto';
import { UpdateDishDto } from './dto/update-dish.dto';
import { QueryDishesDto } from './dto/query-dishes.dto';

@Injectable()
export class DishesService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async findAll(query: QueryDishesDto, isAuthenticated = false) {
    const { lat, lng, radius = 1, category, restaurantId } = query;

    const restaurantSelect = {
      id: true,
      name: isAuthenticated,
      address: isAuthenticated,
      logoUrl: true,
      avgRating: true,
      isOpen: true,
      lat: true,
      lng: true,
    };

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
          restaurant: { select: restaurantSelect },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    const where: Prisma.DishWhereInput = {};
    if (!restaurantId) where.isAvailable = true;
    if (category) where.category = category;
    if (restaurantId) where.restaurantId = restaurantId;

    return this.prisma.dish.findMany({
      where,
      include: {
        restaurant: { select: restaurantSelect },
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

  async create(
    ownerId: string,
    restaurantId: string,
    dto: CreateDishDto,
    photo?: Express.Multer.File,
  ) {
    await this.ensureRestaurantOwnership(ownerId, restaurantId);

    let photoUrl = dto.photoUrl;
    if (photo) {
      photoUrl = await this.storage.upload(photo, 'dishes');
    }

    return this.prisma.dish.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        photoUrl,
        category: dto.category,
        isAvailable: dto.isAvailable ?? true,
        restaurantId,
      },
    });
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateDishDto,
    photo?: Express.Multer.File,
  ) {
    const dish = await this.findDishWithOwner(id);
    if (dish.restaurant.ownerId !== ownerId) {
      throw new ForbiddenException("Vous n'êtes pas le propriétaire de ce plat");
    }

    let photoUrl = dto.photoUrl;
    if (photo) {
      if (dish.photoUrl) {
        await this.storage.delete(dish.photoUrl);
      }
      photoUrl = await this.storage.upload(photo, 'dishes');
    }

    const data: Record<string, any> = { ...dto };
    if (photoUrl !== undefined) {
      data.photoUrl = photoUrl;
    }

    return this.prisma.dish.update({
      where: { id },
      data,
    });
  }

  async remove(ownerId: string, id: string) {
    const dish = await this.findDishWithOwner(id);
    if (dish.restaurant.ownerId !== ownerId) {
      throw new ForbiddenException("Vous n'êtes pas le propriétaire de ce plat");
    }

    if (dish.photoUrl) {
      await this.storage.delete(dish.photoUrl);
    }

    await this.prisma.dish.delete({ where: { id } });
    return { message: 'Plat supprimé' };
  }

  async findTodayDishes(query: QueryDishesDto, isAuthenticated = false) {
    const { lat, lng, radius = 5, category } = query;

    const JS_DAY_TO_ENUM: Record<number, DayOfWeek> = {
      0: DayOfWeek.SUNDAY,
      1: DayOfWeek.MONDAY,
      2: DayOfWeek.TUESDAY,
      3: DayOfWeek.WEDNESDAY,
      4: DayOfWeek.THURSDAY,
      5: DayOfWeek.FRIDAY,
      6: DayOfWeek.SATURDAY,
    };
    const today = JS_DAY_TO_ENUM[new Date().getDay()];

    const where: Prisma.MenuItemWhereInput = {
      isAvailable: true,
      menu: { dayOfWeek: today },
      dish: { isAvailable: true },
    };

    if (category) {
      where.dish = { ...where.dish as object, category };
    }

    if (lat !== undefined && lng !== undefined) {
      const nearbyIds = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM restaurants
        WHERE "isVerified" = true AND (
          6371 * acos(LEAST(1.0, GREATEST(-1.0,
            cos(radians(${lat})) * cos(radians("lat")) *
            cos(radians("lng") - radians(${lng})) +
            sin(radians(${lat})) * sin(radians("lat"))
          )))
        ) <= ${radius}
      `;
      const ids = nearbyIds.map((r) => r.id);
      if (ids.length === 0) return [];
      where.menu = { ...where.menu as object, restaurantId: { in: ids } };
    }

    const menuItems = await this.prisma.menuItem.findMany({
      where,
      include: {
        dish: {
          include: {
            restaurant: {
              select: {
                id: true,
                name: isAuthenticated,
                address: isAuthenticated,
                logoUrl: true,
                avgRating: true,
                isOpen: true,
                lat: true,
                lng: true,
              },
            },
          },
        },
      },
    });

    return menuItems.map((mi) => mi.dish);
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
