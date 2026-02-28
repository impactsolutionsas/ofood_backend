import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentMethod,
  Role,
  TransactionType,
  TransactionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../notifications/sms.service';
import { OrdersGateway } from './orders.gateway';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

const VALID_TRANSITIONS: Record<string, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.AWAITING_PAYMENT, OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.AWAITING_PAYMENT]: [OrderStatus.PAID, OrderStatus.CANCELLED],
  [OrderStatus.PAID]: [OrderStatus.PREPARING],
  [OrderStatus.PREPARING]: [OrderStatus.READY],
  [OrderStatus.READY]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private smsService: SmsService,
    private ordersGateway: OrdersGateway,
  ) {}

  async create(userId: string, dto: CreateOrderDto) {
    // Fetch all dishes and validate
    const dishIds = dto.items.map((i) => i.dishId);
    const dishes = await this.prisma.dish.findMany({
      where: { id: { in: dishIds } },
      include: { restaurant: { select: { id: true, name: true, ownerId: true } } },
    });

    const dishMap = new Map(dishes.map((d) => [d.id, d]));

    // Validate all dishes exist and are available
    for (const item of dto.items) {
      const dish = dishMap.get(item.dishId);
      if (!dish) {
        throw new NotFoundException(`Plat non trouvé : ${item.dishId}`);
      }
      if (!dish.isAvailable) {
        throw new BadRequestException(`Plat indisponible : ${dish.name}`);
      }
    }

    // Build order items with price snapshot
    const orderItems = dto.items.map((item) => {
      const dish = dishMap.get(item.dishId)!;
      const unitPrice = dish.price;
      const subtotal = unitPrice * item.quantity;
      return {
        dishId: item.dishId,
        restaurantId: dish.restaurantId,
        quantity: item.quantity,
        unitPrice,
        subtotal,
      };
    });

    const totalAmount = orderItems.reduce((sum, i) => sum + i.subtotal, 0);

    // Create order in transaction
    const isCod = dto.paymentMethod === PaymentMethod.CASH_ON_DELIVERY;
    const order = await this.prisma.$transaction(async (tx) => {
      return tx.order.create({
        data: {
          userId,
          totalAmount,
          ...(isCod && {
            paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
            paymentStatus: 'COD',
          }),
          items: { create: orderItems },
        },
        include: {
          items: {
            include: {
              dish: { select: { id: true, name: true, photoUrl: true } },
              restaurant: { select: { id: true, name: true } },
            },
          },
        },
      });
    });

    // Notify each restaurant via WebSocket + SMS
    const restaurantIds = [...new Set(orderItems.map((i) => i.restaurantId))];
    for (const restaurantId of restaurantIds) {
      this.ordersGateway.notifyNewOrder(restaurantId, {
        orderId: order.id,
        totalAmount: order.totalAmount,
        items: order.items.filter((i) => i.restaurantId === restaurantId),
      });

      // SMS notification to restaurant owner
      const restaurant = dishes.find((d) => d.restaurantId === restaurantId)?.restaurant;
      if (restaurant) {
        const owner = await this.prisma.user.findUnique({
          where: { id: restaurant.ownerId },
          select: { phone: true },
        });
        if (owner) {
          this.smsService
            .sendSms(owner.phone, `Nouvelle commande reçue sur ${restaurant.name} !`)
            .catch(() => {});
        }
      }
    }

    return order;
  }

  async findMyOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: {
        items: {
          include: {
            dish: { select: { id: true, name: true, photoUrl: true } },
            restaurant: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, role: Role, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            dish: { select: { id: true, name: true, photoUrl: true, price: true } },
            restaurant: { select: { id: true, name: true, ownerId: true } },
          },
        },
        user: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Commande non trouvée');
    }

    // Access control
    if (role === Role.CLIENT && order.userId !== userId) {
      throw new ForbiddenException("Vous n'avez pas accès à cette commande");
    }

    if (role === Role.RESTAURANT_OWNER) {
      const hasAccess = order.items.some((i) => i.restaurant.ownerId === userId);
      if (!hasAccess) {
        throw new ForbiddenException("Vous n'avez pas accès à cette commande");
      }
    }

    return order;
  }

  async findRestaurantOrders(ownerId: string, statusFilter?: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { ownerId },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant non trouvé');
    }

    const where: Record<string, unknown> = {
      items: { some: { restaurantId: restaurant.id } },
    };

    if (statusFilter === 'history') {
      where.status = { in: [OrderStatus.DELIVERED, OrderStatus.CANCELLED] };
    } else if (statusFilter === 'active') {
      where.status = { in: [OrderStatus.PENDING, OrderStatus.PAID, OrderStatus.PREPARING, OrderStatus.READY] };
    }

    return this.prisma.order.findMany({
      where,
      include: {
        items: {
          where: { restaurantId: restaurant.id },
          include: {
            dish: { select: { id: true, name: true, photoUrl: true } },
          },
        },
        user: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(ownerId: string, orderId: string, dto: UpdateOrderStatusDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            restaurant: { select: { id: true, ownerId: true, name: true } },
          },
        },
        user: { select: { id: true, phone: true, firstName: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Commande non trouvée');
    }

    // Verify ownership
    const hasAccess = order.items.some((i) => i.restaurant.ownerId === ownerId);
    if (!hasAccess) {
      throw new ForbiddenException("Vous n'avez pas accès à cette commande");
    }

    // Validate transition
    const allowed = VALID_TRANSITIONS[order.status] || [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Transition invalide : ${order.status} → ${dto.status}`,
      );
    }

    const isCodDelivery =
      dto.status === OrderStatus.DELIVERED &&
      order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY;

    const orderInclude = {
      items: {
        include: {
          dish: { select: { id: true, name: true } },
          restaurant: { select: { id: true, name: true } },
        },
      },
    };

    let updated;

    if (isCodDelivery) {
      // COD delivery: update status + credit restaurant wallets atomically
      updated = await this.prisma.$transaction(async (tx) => {
        const updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: { status: dto.status, paymentStatus: 'PAID' },
          include: orderInclude,
        });

        // Compute per-restaurant amounts
        const restaurantAmounts = new Map<string, number>();
        for (const item of order.items) {
          const current = restaurantAmounts.get(item.restaurantId) || 0;
          restaurantAmounts.set(item.restaurantId, current + item.subtotal);
        }

        // Credit each restaurant wallet + create transaction records
        for (const [restaurantId, amount] of restaurantAmounts) {
          await tx.restaurant.update({
            where: { id: restaurantId },
            data: { walletBalance: { increment: amount } },
          });
          await tx.transaction.create({
            data: {
              restaurantId,
              orderId: order.id,
              type: TransactionType.CREDIT,
              amount,
              status: TransactionStatus.SUCCESS,
              note: `Paiement à la livraison commande #${order.id.slice(0, 8)}`,
            },
          });
        }

        return updatedOrder;
      });
    } else {
      updated = await this.prisma.order.update({
        where: { id: orderId },
        data: { status: dto.status },
        include: orderInclude,
      });
    }

    // Notify via WebSocket
    const restaurantIds = [...new Set(order.items.map((i) => i.restaurant.id))];
    for (const restaurantId of restaurantIds) {
      this.ordersGateway.notifyStatusChange(
        restaurantId,
        order.userId,
        orderId,
        dto.status,
      );
    }

    // SMS to client when order is READY
    if (dto.status === OrderStatus.READY && order.user) {
      this.smsService
        .sendSms(
          order.user.phone,
          `${order.user.firstName}, votre commande est prête ! Rendez-vous au restaurant.`,
        )
        .catch(() => {});
    }

    return updated;
  }
}
