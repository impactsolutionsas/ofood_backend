import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliveryStatus, NotificationCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PushService } from '../push/push.service';
import { haversineDistance } from '../common/helpers/geo.helper';

interface CourierCandidate {
  id: string;
  userId: string;
  currentLat: number;
  currentLng: number;
  avgRating: number;
  distance: number;
  score: number;
}

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private prisma: PrismaService,
    private redisService: RedisService,
    private pushService: PushService,
    private configService: ConfigService,
  ) {}

  async dispatchDelivery(deliveryId: string) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        order: {
          include: {
            items: {
              include: {
                restaurant: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!delivery || delivery.status !== DeliveryStatus.SEARCHING) {
      return;
    }

    const radii = [3, 5, 8];

    for (const radius of radii) {
      const candidate = await this.findBestCourier(
        delivery.pickupLat,
        delivery.pickupLng,
        radius,
        deliveryId,
      );

      if (candidate) {
        await this.assignCourier(deliveryId, candidate);
        return;
      }
    }

    this.logger.warn(`No courier found for delivery ${deliveryId}`);
  }

  private async findBestCourier(
    pickupLat: number,
    pickupLng: number,
    radiusKm: number,
    deliveryId: string,
  ): Promise<CourierCandidate | null> {
    // Find online, verified couriers with no active delivery
    const couriers = await this.prisma.courier.findMany({
      where: {
        isVerified: true,
        isOnline: true,
        currentLat: { not: null },
        currentLng: { not: null },
        deliveries: {
          none: {
            status: {
              in: [
                DeliveryStatus.ASSIGNED,
                DeliveryStatus.PICKED_UP,
                DeliveryStatus.IN_TRANSIT,
              ],
            },
          },
        },
      },
      select: {
        id: true,
        userId: true,
        currentLat: true,
        currentLng: true,
        avgRating: true,
      },
    });

    // Check rejected list in Redis
    const candidates: CourierCandidate[] = [];

    for (const courier of couriers) {
      const rejected = await this.redisService.exists(
        `delivery:${deliveryId}:rejected:${courier.id}`,
      );
      if (rejected) continue;

      const distance = haversineDistance(
        pickupLat,
        pickupLng,
        courier.currentLat!,
        courier.currentLng!,
      );

      if (distance <= radiusKm) {
        // Score: 70% distance (inverse), 30% rating
        const distanceScore = 1 - distance / radiusKm;
        const ratingScore = courier.avgRating / 5;
        const score = 0.7 * distanceScore + 0.3 * ratingScore;

        candidates.push({
          id: courier.id,
          userId: courier.userId,
          currentLat: courier.currentLat!,
          currentLng: courier.currentLng!,
          avgRating: courier.avgRating,
          distance,
          score,
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
  }

  private async assignCourier(deliveryId: string, candidate: CourierCandidate) {
    await this.prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        courierId: candidate.id,
        status: DeliveryStatus.ASSIGNED,
        assignedAt: new Date(),
      },
    });

    // Set acceptance timeout (60s)
    await this.redisService.set(
      `delivery:${deliveryId}:pending_acceptance`,
      candidate.id,
      60,
    );

    // Notify courier
    await this.pushService.sendToUser(
      candidate.userId,
      NotificationCategory.DELIVERY_UPDATE,
      'Nouvelle course disponible !',
      `Une commande vous attend à ${candidate.distance.toFixed(1)} km`,
      { deliveryId },
    );

    this.logger.log(
      `Courier ${candidate.id} assigned to delivery ${deliveryId} (${candidate.distance.toFixed(1)} km)`,
    );
  }
}
