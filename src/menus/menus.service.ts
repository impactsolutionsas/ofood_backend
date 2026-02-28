import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DayOfWeek } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SetWeeklyMenuDto } from './dto/set-weekly-menu.dto';

const JS_DAY_TO_ENUM: Record<number, DayOfWeek> = {
  0: DayOfWeek.SUNDAY,
  1: DayOfWeek.MONDAY,
  2: DayOfWeek.TUESDAY,
  3: DayOfWeek.WEDNESDAY,
  4: DayOfWeek.THURSDAY,
  5: DayOfWeek.FRIDAY,
  6: DayOfWeek.SATURDAY,
};

@Injectable()
export class MenusService {
  constructor(private prisma: PrismaService) {}

  async getWeeklyMenu(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant non trouvé');
    }

    return this.prisma.menu.findMany({
      where: { restaurantId },
      include: {
        items: {
          include: { dish: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async getTodayMenu(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant non trouvé');
    }

    const today = JS_DAY_TO_ENUM[new Date().getDay()];

    const menu = await this.prisma.menu.findUnique({
      where: { restaurantId_dayOfWeek: { restaurantId, dayOfWeek: today } },
      include: {
        items: {
          include: { dish: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!menu) {
      return { dayOfWeek: today, items: [] };
    }

    return menu;
  }

  async setWeeklyMenu(ownerId: string, restaurantId: string, dto: SetWeeklyMenuDto) {
    const restaurant = await this.ensureOwnership(ownerId, restaurantId);

    // Vérifier que tous les dishIds appartiennent au restaurant
    const allDishIds = [...new Set(dto.menus.flatMap((m) => m.dishIds))];
    if (allDishIds.length > 0) {
      const dishes = await this.prisma.dish.findMany({
        where: { id: { in: allDishIds }, restaurantId: restaurant.id },
        select: { id: true },
      });
      const foundIds = new Set(dishes.map((d) => d.id));
      const missing = allDishIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(
          `Plats non trouvés dans ce restaurant : ${missing.join(', ')}`,
        );
      }
    }

    // Transaction : supprimer les anciens menus, créer les nouveaux
    await this.prisma.$transaction(async (tx) => {
      await tx.menu.deleteMany({ where: { restaurantId: restaurant.id } });

      for (const menuDay of dto.menus) {
        await tx.menu.create({
          data: {
            restaurantId: restaurant.id,
            dayOfWeek: menuDay.dayOfWeek,
            items: {
              create: menuDay.dishIds.map((dishId) => ({ dishId })),
            },
          },
        });
      }
    });

    return this.getWeeklyMenu(restaurantId);
  }

  async toggleMenuItem(ownerId: string, menuItemId: string) {
    const menuItem = await this.prisma.menuItem.findUnique({
      where: { id: menuItemId },
      include: {
        menu: {
          include: { restaurant: { select: { id: true, ownerId: true } } },
        },
      },
    });

    if (!menuItem) {
      throw new NotFoundException('Élément de menu non trouvé');
    }

    if (menuItem.menu.restaurant.ownerId !== ownerId) {
      throw new ForbiddenException("Vous n'êtes pas le propriétaire de ce restaurant");
    }

    return this.prisma.menuItem.update({
      where: { id: menuItemId },
      data: { isAvailable: !menuItem.isAvailable },
      include: { dish: true },
    });
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
