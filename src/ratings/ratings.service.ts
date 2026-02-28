import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRatingDto } from './dto/create-rating.dto';

@Injectable()
export class RatingsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateRatingDto) {
    // Vérifier la commande
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        rating: true,
        items: { select: { restaurantId: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Commande non trouvée');
    }

    if (order.userId !== userId) {
      throw new ForbiddenException("Cette commande ne vous appartient pas");
    }

    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException(
        'Vous ne pouvez noter que les commandes livrées',
      );
    }

    if (order.rating) {
      throw new ConflictException('Cette commande a déjà été notée');
    }

    // Déterminer le restaurant (premier restaurant de la commande)
    const restaurantId = order.items[0].restaurantId;

    // Transaction : créer rating + mettre à jour avgRating
    return this.prisma.$transaction(async (tx) => {
      const rating = await tx.rating.create({
        data: {
          orderId: dto.orderId,
          userId,
          restaurantId,
          stars: dto.stars,
          comment: dto.comment,
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      // Recalculer avgRating
      const restaurant = await tx.restaurant.findUnique({
        where: { id: restaurantId },
        select: { avgRating: true, totalRatings: true },
      });

      if (restaurant) {
        const newTotal = restaurant.totalRatings + 1;
        const newAvg =
          (restaurant.avgRating * restaurant.totalRatings + dto.stars) / newTotal;

        await tx.restaurant.update({
          where: { id: restaurantId },
          data: {
            avgRating: Math.round(newAvg * 100) / 100,
            totalRatings: newTotal,
          },
        });
      }

      return rating;
    });
  }

  async findByRestaurant(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant non trouvé');
    }

    return this.prisma.rating.findMany({
      where: { restaurantId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
