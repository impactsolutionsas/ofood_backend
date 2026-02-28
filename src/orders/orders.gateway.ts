import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: true })
export class OrdersGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('join-restaurant')
  handleJoinRestaurant(
    @ConnectedSocket() client: Socket,
    @MessageBody() restaurantId: string,
  ) {
    client.join(`restaurant:${restaurantId}`);
    return { event: 'joined', data: restaurantId };
  }

  @SubscribeMessage('join-user')
  handleJoinUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() userId: string,
  ) {
    client.join(`user:${userId}`);
    return { event: 'joined', data: userId };
  }

  notifyNewOrder(restaurantId: string, orderData: unknown) {
    this.server.to(`restaurant:${restaurantId}`).emit('new-order', orderData);
  }

  notifyStatusChange(restaurantId: string, userId: string, orderId: string, status: string) {
    this.server
      .to(`restaurant:${restaurantId}`)
      .emit('order-status', { orderId, status });
    this.server
      .to(`user:${userId}`)
      .emit('order-status', { orderId, status });
  }
}
