import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { NotificationCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    const vapidPublic = this.configService.get<string>('VAPID_PUBLIC_KEY', '');
    const vapidPrivate = this.configService.get<string>('VAPID_PRIVATE_KEY', '');
    const vapidSubject = this.configService.get<string>(
      'VAPID_SUBJECT',
      'mailto:contact@ofood.sn',
    );

    if (vapidPublic && vapidPrivate) {
      webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    } else {
      this.logger.warn('VAPID keys not configured — push notifications disabled');
    }
  }

  getVapidPublicKey(): string {
    return this.configService.get<string>('VAPID_PUBLIC_KEY', '');
  }

  async subscribe(userId: string, endpoint: string, p256dh: string, auth: string) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId, p256dhKey: p256dh, authKey: auth, isActive: true },
      create: { userId, endpoint, p256dhKey: p256dh, authKey: auth },
    });
  }

  async unsubscribe(userId: string) {
    await this.prisma.pushSubscription.updateMany({
      where: { userId },
      data: { isActive: false },
    });
    return { message: 'Désabonné des notifications push' };
  }

  async sendToUser(
    userId: string,
    category: NotificationCategory,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ) {
    // Create notification log
    await this.prisma.notificationLog.create({
      data: { userId, category, title, body, data: (data ?? Prisma.JsonNull) as Prisma.InputJsonValue },
    });

    // Send push to all active subscriptions
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId, isActive: true },
    });

    const payload = JSON.stringify({ title, body, data });

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dhKey, auth: sub.authKey },
            },
            payload,
          );
        } catch (error: unknown) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 410 || statusCode === 404) {
            // Subscription expired — deactivate
            await this.prisma.pushSubscription.update({
              where: { id: sub.id },
              data: { isActive: false },
            });
          }
          throw error;
        }
      }),
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    this.logger.log(`Push to user ${userId}: ${sent} sent, ${failed} failed`);
  }

  async getNotifications(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      this.prisma.notificationLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notificationLog.count({ where: { userId } }),
    ]);

    return {
      notifications,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notificationLog.count({
      where: { userId, isRead: false },
    });
    return { unreadCount: count };
  }

  async markAsRead(userId: string, notificationId: string) {
    await this.prisma.notificationLog.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
    return { message: 'Notification marquée comme lue' };
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notificationLog.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { message: 'Toutes les notifications marquées comme lues' };
  }

  async broadcast(title: string, body: string, url?: string) {
    // Get all users with active subscriptions
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { isActive: true },
      include: { user: { select: { id: true } } },
    });

    // Create notification logs for all unique users
    const userIds = [...new Set(subscriptions.map((s) => s.userId))];
    await this.prisma.notificationLog.createMany({
      data: userIds.map((userId) => ({
        userId,
        category: NotificationCategory.PROMO,
        title,
        body,
        data: (url ? { url } : Prisma.JsonNull) as Prisma.InputJsonValue,
      })),
    });

    // Send push
    const payload = JSON.stringify({ title, body, data: { url } });
    let sent = 0;

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dhKey, auth: sub.authKey },
            },
            payload,
          );
          sent++;
        } catch (error: unknown) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 410 || statusCode === 404) {
            await this.prisma.pushSubscription.update({
              where: { id: sub.id },
              data: { isActive: false },
            });
          }
        }
      }),
    );

    return { message: `Notification envoyée à ${sent} appareils`, totalUsers: userIds.length };
  }
}
