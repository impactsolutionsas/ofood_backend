import {
  Controller,
  Get,
  Post,
  Patch,
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
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { DeliveryService } from './delivery.service';
import { RegisterCourierDto } from './dto/register-courier.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { ConfirmDeliveryDto } from './dto/confirm-delivery.dto';
import { RateCourierDto } from './dto/rate-courier.dto';

@ApiTags('Delivery')
@ApiBearerAuth()
@Controller('delivery')
@UseGuards(RolesGuard)
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  // ─── Courier routes ────────────────────────────────

  @Post('courier/register')
  @Roles(Role.CLIENT)
  registerCourier(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RegisterCourierDto,
  ) {
    return this.deliveryService.registerCourier(user.sub, dto);
  }

  @Get('courier/me')
  @Roles(Role.COURIER)
  getCourierProfile(@CurrentUser() user: JwtPayload) {
    return this.deliveryService.getCourierProfile(user.sub);
  }

  @Patch('courier/availability')
  @Roles(Role.COURIER)
  toggleAvailability(@CurrentUser() user: JwtPayload) {
    return this.deliveryService.toggleAvailability(user.sub);
  }

  @Patch('courier/location')
  @Roles(Role.COURIER)
  updateLocation(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.deliveryService.updateCourierLocation(user.sub, dto.lat, dto.lng);
  }

  @Get('courier/active')
  @Roles(Role.COURIER)
  getActiveDelivery(@CurrentUser() user: JwtPayload) {
    return this.deliveryService.getActiveDelivery(user.sub);
  }

  @Get('courier/history')
  @Roles(Role.COURIER)
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getCourierHistory(
    @CurrentUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.deliveryService.getCourierHistory(user.sub, page, limit);
  }

  @Post('courier/cashout')
  @Roles(Role.COURIER)
  courierCashout(@CurrentUser() user: JwtPayload) {
    return this.deliveryService.courierCashout(user.sub);
  }

  // ─── Delivery routes ──────────────────────────────

  @Get('order/:orderId')
  @Roles(Role.CLIENT)
  getDeliveryByOrder(
    @CurrentUser() user: JwtPayload,
    @Param('orderId') orderId: string,
  ) {
    return this.deliveryService.getDeliveryByOrder(user.sub, orderId);
  }

  @Post(':id/accept')
  @Roles(Role.COURIER)
  acceptDelivery(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.deliveryService.acceptDelivery(user.sub, id);
  }

  @Post(':id/reject')
  @Roles(Role.COURIER)
  rejectDelivery(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.deliveryService.rejectDelivery(user.sub, id);
  }

  @Post(':id/pickup')
  @Roles(Role.COURIER)
  pickupDelivery(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.deliveryService.pickupDelivery(user.sub, id);
  }

  @Post(':id/confirm')
  @Roles(Role.COURIER)
  confirmDelivery(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ConfirmDeliveryDto,
  ) {
    return this.deliveryService.confirmDelivery(user.sub, id, dto);
  }

  @Post(':id/rate')
  @Roles(Role.CLIENT)
  rateDelivery(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RateCourierDto,
  ) {
    return this.deliveryService.rateDelivery(user.sub, id, dto);
  }

  // ─── Admin routes ─────────────────────────────────

  @Get('admin/couriers')
  @Roles(Role.ADMIN)
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getAdminCouriers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.deliveryService.getAdminCouriers(page, limit);
  }

  @Patch('admin/couriers/:id/verify')
  @Roles(Role.ADMIN)
  verifyCourier(@Param('id') id: string) {
    return this.deliveryService.verifyCourier(id);
  }
}
