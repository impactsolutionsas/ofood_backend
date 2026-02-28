import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@WebSocketGateway({ namespace: '/tracking', cors: true })
export class TrackingGateway {
  @WebSocketServer()
  server: Server;

  constructor(
    private prisma: PrismaService,
    private redisService: RedisService,
  ) {}

  @SubscribeMessage('join-delivery')
  handleJoinDelivery(
    @ConnectedSocket() client: Socket,
    @MessageBody() deliveryId: string,
  ) {
    client.join(`delivery:${deliveryId}`);
    return { event: 'joined', data: deliveryId };
  }

  @SubscribeMessage('update-location')
  async handleUpdateLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { deliveryId: string; lat: number; lng: number; speed?: number },
  ) {
    // Save to DB
    await this.prisma.deliveryLocation.create({
      data: {
        deliveryId: data.deliveryId,
        lat: data.lat,
        lng: data.lng,
        speed: data.speed,
      },
    });

    // Cache in Redis
    await this.redisService.set(
      `delivery:location:${data.deliveryId}`,
      JSON.stringify({ lat: data.lat, lng: data.lng, speed: data.speed, updatedAt: Date.now() }),
      300,
    );

    // Broadcast to clients watching this delivery
    this.server.to(`delivery:${data.deliveryId}`).emit('courier-location', {
      deliveryId: data.deliveryId,
      lat: data.lat,
      lng: data.lng,
      speed: data.speed,
      timestamp: Date.now(),
    });

    return { event: 'location-saved' };
  }

  emitDeliveryStatusChange(deliveryId: string, status: string) {
    this.server.to(`delivery:${deliveryId}`).emit('delivery-status', {
      deliveryId,
      status,
      timestamp: Date.now(),
    });
  }
}
