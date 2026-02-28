import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  DeliveryStatus,
  OrderStatus,
  NotificationCategory,
  TransactionType,
  TransactionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PushService } from '../push/push.service';
import { DispatchService } from './dispatch.service';
import { RegisterCourierDto } from './dto/register-courier.dto';
import { ConfirmDeliveryDto } from './dto/confirm-delivery.dto';
import { RateCourierDto } from './dto/rate-courier.dto';
import { haversineDistance } from '../common/helpers/geo.helper';

@Injectable()
export class DeliveryService {
  constructor(
    private prisma: PrismaService,
    private redisService: RedisService,
    private pushService: PushService,
    private dispatchService: DispatchService,
  ) {}

  // ─── Courier Registration ──────────────────────────

  async registerCourier(userId: string, dto: RegisterCourierDto) {
    const existing = await this.prisma.courier.findUnique({
      where: { userId },
    });

    if (existing) {
      throw new BadRequestException('Vous êtes déjà inscrit comme livreur');
    }

    // Update user role to COURIER
    await this.prisma.user.update({
      where: { id: userId },
      data: { role: 'COURIER' },
    });

    const courier = await this.prisma.courier.create({
      data: {
        userId,
        vehicle: dto.vehicle,
        plateNumber: dto.plateNumber,
        idCardUrl: dto.idCardUrl,
        selfieUrl: dto.selfieUrl,
      },
    });

    return courier;
  }

  async getCourierProfile(userId: string) {
    const courier = await this.prisma.courier.findUnique({
      where: { userId },
      include: {
        user: { select: { firstName: true, lastName: true, phone: true } },
      },
    });

    if (!courier) {
      throw new NotFoundException('Profil livreur non trouvé');
    }

    return courier;
  }

  async toggleAvailability(userId: string) {
    const courier = await this.prisma.courier.findUnique({
      where: { userId },
    });

    if (!courier) {
      throw new NotFoundException('Profil livreur non trouvé');
    }

    if (!courier.isVerified) {
      throw new BadRequestException(
        'Votre profil doit être vérifié avant de pouvoir livrer',
      );
    }

    const updated = await this.prisma.courier.update({
      where: { id: courier.id },
      data: { isOnline: !courier.isOnline },
    });

    return { isOnline: updated.isOnline };
  }

  async updateCourierLocation(userId: string, lat: number, lng: number) {
    const courier = await this.prisma.courier.findUnique({
      where: { userId },
    });

    if (!courier) {
      throw new NotFoundException('Profil livreur non trouvé');
    }

    await this.prisma.courier.update({
      where: { id: courier.id },
      data: { currentLat: lat, currentLng: lng },
    });

    // Cache in Redis for quick access
    await this.redisService.set(
      `courier:location:${courier.id}`,
      JSON.stringify({ lat, lng, updatedAt: Date.now() }),
      300, // 5 min TTL
    );

    return { message: 'Position mise à jour' };
  }

  async getActiveDelivery(userId: string) {
    const courier = await this.prisma.courier.findUnique({
      where: { userId },
    });

    if (!courier) {
      throw new NotFoundException('Profil livreur non trouvé');
    }

    const delivery = await this.prisma.delivery.findFirst({
      where: {
        courierId: courier.id,
        status: {
          in: [
            DeliveryStatus.ASSIGNED,
            DeliveryStatus.PICKED_UP,
            DeliveryStatus.IN_TRANSIT,
          ],
        },
      },
      include: {
        order: {
          include: {
            user: { select: { firstName: true, lastName: true, phone: true } },
            items: {
              include: {
                dish: { select: { name: true } },
                restaurant: { select: { name: true, address: true, lat: true, lng: true } },
              },
            },
          },
        },
      },
    });

    return delivery;
  }

  async getCourierHistory(userId: string, page = 1, limit = 20) {
    const courier = await this.prisma.courier.findUnique({
      where: { userId },
    });

    if (!courier) {
      throw new NotFoundException('Profil livreur non trouvé');
    }

    const skip = (page - 1) * limit;

    const [deliveries, total] = await Promise.all([
      this.prisma.delivery.findMany({
        where: { courierId: courier.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          order: {
            select: { id: true, totalAmount: true, createdAt: true },
          },
        },
      }),
      this.prisma.delivery.count({ where: { courierId: courier.id } }),
    ]);

    return {
      deliveries,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Delivery Flow ─────────────────────────────────

  async createDeliveryForOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { id: true } },
        items: {
          include: {
            restaurant: { select: { lat: true, lng: true } },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Commande non trouvée');
    }

    // Use the first restaurant's location as pickup
    const restaurant = order.items[0]?.restaurant;
    if (!restaurant) {
      throw new BadRequestException('Pas de restaurant sur la commande');
    }

    // Generate 4-digit confirmation code
    const confirmationCode = Math.floor(1000 + Math.random() * 9000).toString();

    // Calculate delivery fee based on a default distance
    const feePerKm = 500;
    const baseFee = 500;

    const delivery = await this.prisma.delivery.create({
      data: {
        orderId,
        status: DeliveryStatus.SEARCHING,
        pickupLat: restaurant.lat,
        pickupLng: restaurant.lng,
        dropoffLat: restaurant.lat, // Default, will be updated with real client address
        dropoffLng: restaurant.lng,
        deliveryFee: baseFee,
        confirmationCode,
      },
    });

    // Start dispatch
    await this.dispatchService.dispatchDelivery(delivery.id);

    return delivery;
  }

  async getDeliveryByOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Commande non trouvée');
    }

    if (order.userId !== userId) {
      throw new ForbiddenException("Cette commande ne vous appartient pas");
    }

    const delivery = await this.prisma.delivery.findUnique({
      where: { orderId },
      include: {
        courier: {
          include: {
            user: { select: { firstName: true, lastName: true, phone: true } },
          },
        },
        locations: {
          orderBy: { recordedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!delivery) {
      throw new NotFoundException('Aucune livraison pour cette commande');
    }

    return delivery;
  }

  async acceptDelivery(userId: string, deliveryId: string) {
    const courier = await this.prisma.courier.findUnique({
      where: { userId },
    });

    if (!courier) {
      throw new NotFoundException('Profil livreur non trouvé');
    }

    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { order: { select: { userId: true } } },
    });

    if (!delivery) {
      throw new NotFoundException('Livraison non trouvée');
    }

    if (delivery.courierId !== courier.id) {
      throw new ForbiddenException('Cette livraison ne vous est pas assignée');
    }

    if (delivery.status !== DeliveryStatus.ASSIGNED) {
      throw new BadRequestException('Cette livraison ne peut pas être acceptée');
    }

    await this.prisma.delivery.update({
      where: { id: deliveryId },
      data: { status: DeliveryStatus.ASSIGNED },
    });

    // Clear timeout
    await this.redisService.del(`delivery:${deliveryId}:pending_acceptance`);

    // Notify client
    await this.pushService.sendToUser(
      delivery.order.userId,
      NotificationCategory.DELIVERY_UPDATE,
      'Livreur en route !',
      'Un livreur a accepté votre commande et se dirige vers le restaurant.',
      { deliveryId },
    );

    return { message: 'Livraison acceptée' };
  }

  async rejectDelivery(userId: string, deliveryId: string) {
    const courier = await this.prisma.courier.findUnique({
      where: { userId },
    });

    if (!courier) {
      throw new NotFoundException('Profil livreur non trouvé');
    }

    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
    });

    if (!delivery || delivery.courierId !== courier.id) {
      throw new NotFoundException('Livraison non trouvée');
    }

    if (delivery.status !== DeliveryStatus.ASSIGNED) {
      throw new BadRequestException('Cette livraison ne peut pas être refusée');
    }

    // Mark as rejected in Redis
    await this.redisService.set(
      `delivery:${deliveryId}:rejected:${courier.id}`,
      '1',
      3600,
    );

    // Reset delivery and re-dispatch
    await this.prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        courierId: null,
        status: DeliveryStatus.SEARCHING,
        assignedAt: null,
      },
    });

    // Find next courier
    await this.dispatchService.dispatchDelivery(deliveryId);

    return { message: 'Livraison refusée, recherche d\'un autre livreur' };
  }

  async pickupDelivery(userId: string, deliveryId: string) {
    const courier = await this.prisma.courier.findUnique({
      where: { userId },
    });

    if (!courier) {
      throw new NotFoundException('Profil livreur non trouvé');
    }

    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { order: { select: { userId: true, id: true } } },
    });

    if (!delivery || delivery.courierId !== courier.id) {
      throw new NotFoundException('Livraison non trouvée');
    }

    if (delivery.status !== DeliveryStatus.ASSIGNED) {
      throw new BadRequestException('La commande doit être assignée pour être récupérée');
    }

    await this.prisma.$transaction([
      this.prisma.delivery.update({
        where: { id: deliveryId },
        data: {
          status: DeliveryStatus.PICKED_UP,
          pickedUpAt: new Date(),
        },
      }),
      this.prisma.order.update({
        where: { id: delivery.order.id },
        data: { status: OrderStatus.PICKED_UP },
      }),
    ]);

    // Notify client
    await this.pushService.sendToUser(
      delivery.order.userId,
      NotificationCategory.DELIVERY_UPDATE,
      'Commande récupérée !',
      'Le livreur a récupéré votre commande et se dirige vers vous.',
      { deliveryId },
    );

    return { message: 'Commande récupérée, en route vers le client' };
  }

  async confirmDelivery(
    userId: string,
    deliveryId: string,
    dto: ConfirmDeliveryDto,
  ) {
    const courier = await this.prisma.courier.findUnique({
      where: { userId },
    });

    if (!courier) {
      throw new NotFoundException('Profil livreur non trouvé');
    }

    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { order: { select: { userId: true, id: true, totalAmount: true } } },
    });

    if (!delivery || delivery.courierId !== courier.id) {
      throw new NotFoundException('Livraison non trouvée');
    }

    if (
      delivery.status !== DeliveryStatus.PICKED_UP &&
      delivery.status !== DeliveryStatus.IN_TRANSIT
    ) {
      throw new BadRequestException('La commande doit être en transit');
    }

    if (delivery.confirmationCode !== dto.confirmationCode) {
      throw new BadRequestException('Code de confirmation invalide');
    }

    const courierSharePct = 0.8;
    const platformSharePct = 0.2;
    const fee = delivery.deliveryFee ?? 0;
    const courierShare = fee * courierSharePct;
    const platformShare = fee * platformSharePct;

    await this.prisma.$transaction([
      this.prisma.delivery.update({
        where: { id: deliveryId },
        data: {
          status: DeliveryStatus.DELIVERED,
          deliveredAt: new Date(),
          proofPhotoUrl: dto.proofPhotoUrl,
          courierShare,
          platformShare,
        },
      }),
      this.prisma.order.update({
        where: { id: delivery.order.id },
        data: { status: OrderStatus.DELIVERED },
      }),
      // Credit courier wallet
      this.prisma.courier.update({
        where: { id: courier.id },
        data: { walletBalance: { increment: courierShare } },
      }),
      this.prisma.courierTransaction.create({
        data: {
          courierId: courier.id,
          deliveryId,
          type: TransactionType.CREDIT,
          amount: courierShare,
          status: TransactionStatus.SUCCESS,
          note: `Livraison commande #${delivery.order.id.slice(0, 8)}`,
        },
      }),
    ]);

    // Notify client
    await this.pushService.sendToUser(
      delivery.order.userId,
      NotificationCategory.DELIVERY_UPDATE,
      'Commande livrée !',
      'Votre commande a été livrée avec succès. Bon appétit !',
      { deliveryId },
    );

    return { message: 'Livraison confirmée', courierEarnings: courierShare };
  }

  async rateDelivery(userId: string, deliveryId: string, dto: RateCourierDto) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { order: true, courier: true },
    });

    if (!delivery) {
      throw new NotFoundException('Livraison non trouvée');
    }

    if (delivery.order.userId !== userId) {
      throw new ForbiddenException("Cette livraison ne vous concerne pas");
    }

    if (delivery.status !== DeliveryStatus.DELIVERED) {
      throw new BadRequestException('La livraison doit être terminée pour noter');
    }

    if (!delivery.courier) {
      throw new BadRequestException('Pas de livreur assigné');
    }

    // Update courier rating
    const newTotalRatings = delivery.courier.totalRatings + 1;
    const newAvgRating =
      (delivery.courier.avgRating * delivery.courier.totalRatings + dto.stars) /
      newTotalRatings;

    await this.prisma.courier.update({
      where: { id: delivery.courier.id },
      data: {
        avgRating: Math.round(newAvgRating * 10) / 10,
        totalRatings: newTotalRatings,
      },
    });

    return { message: 'Merci pour votre évaluation !', rating: dto.stars };
  }

  // ─── Courier Cashout ──────────────────────────────

  async courierCashout(userId: string) {
    const courier = await this.prisma.courier.findUnique({
      where: { userId },
    });

    if (!courier) {
      throw new NotFoundException('Profil livreur non trouvé');
    }

    if (courier.walletBalance < 1000) {
      throw new BadRequestException('Minimum de retrait : 1000 FCFA');
    }

    const amount = courier.walletBalance;

    await this.prisma.$transaction([
      this.prisma.courier.update({
        where: { id: courier.id },
        data: { walletBalance: 0 },
      }),
      this.prisma.courierTransaction.create({
        data: {
          courierId: courier.id,
          type: TransactionType.DEBIT,
          amount,
          status: TransactionStatus.PENDING,
          note: 'Demande de virement',
        },
      }),
    ]);

    return { message: 'Demande de virement enregistrée', amount };
  }

  // ─── Admin ─────────────────────────────────────────

  async getAdminCouriers(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [couriers, total] = await Promise.all([
      this.prisma.courier.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { firstName: true, lastName: true, phone: true } },
          _count: { select: { deliveries: true } },
        },
      }),
      this.prisma.courier.count(),
    ]);

    return {
      couriers,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async verifyCourier(courierId: string) {
    const courier = await this.prisma.courier.findUnique({
      where: { id: courierId },
    });

    if (!courier) {
      throw new NotFoundException('Livreur non trouvé');
    }

    await this.prisma.courier.update({
      where: { id: courierId },
      data: { isVerified: true },
    });

    await this.pushService.sendToUser(
      courier.userId,
      NotificationCategory.SYSTEM,
      'Profil vérifié !',
      'Votre profil livreur a été vérifié. Vous pouvez maintenant accepter des courses.',
    );

    return { message: 'Livreur vérifié' };
  }
}
