import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

export interface Notification {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/notifications',
})
export class NotificationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  afterInit() {
    this.logger.log('NotificationGateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /** Gửi thông báo mới đến tất cả client */
  broadcastNew(notification: Notification) {
    this.server.emit('notification:new', notification);
  }

  /** Gửi thông báo đã cập nhật đến tất cả client */
  broadcastUpdated(notification: Notification) {
    this.server.emit('notification:updated', notification);
  }

  /** Gửi ID thông báo bị xóa đến tất cả client */
  broadcastDeleted(id: string) {
    this.server.emit('notification:deleted', { id });
  }
}