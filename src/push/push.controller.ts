import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { PushService } from './push.service';
import { SubscribeDto } from './dto/subscribe.dto';
import { BroadcastDto } from './dto/broadcast.dto';

@ApiTags('Push Notifications')
@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('vapid-key')
  @Public()
  getVapidKey() {
    return { publicKey: this.pushService.getVapidPublicKey() };
  }

  @Post('subscribe')
  @ApiBearerAuth()
  subscribe(@CurrentUser() user: JwtPayload, @Body() dto: SubscribeDto) {
    return this.pushService.subscribe(user.sub, dto.endpoint, dto.keys.p256dh, dto.keys.auth);
  }

  @Delete('unsubscribe')
  @ApiBearerAuth()
  unsubscribe(@CurrentUser() user: JwtPayload) {
    return this.pushService.unsubscribe(user.sub);
  }

  @Get('notifications')
  @ApiBearerAuth()
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getNotifications(
    @CurrentUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.pushService.getNotifications(user.sub, page, limit);
  }

  @Get('notifications/unread')
  @ApiBearerAuth()
  getUnreadCount(@CurrentUser() user: JwtPayload) {
    return this.pushService.getUnreadCount(user.sub);
  }

  @Patch('notifications/:id/read')
  @ApiBearerAuth()
  markAsRead(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.pushService.markAsRead(user.sub, id);
  }

  @Patch('notifications/read-all')
  @ApiBearerAuth()
  markAllAsRead(@CurrentUser() user: JwtPayload) {
    return this.pushService.markAllAsRead(user.sub);
  }

  @Post('broadcast')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  broadcast(@Body() dto: BroadcastDto) {
    return this.pushService.broadcast(dto.title, dto.body, dto.url);
  }
}
