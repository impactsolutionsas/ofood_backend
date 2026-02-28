import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @Post()
  @ApiOperation({ summary: 'Créer une commande (CLIENT)' })
  @ApiResponse({ status: 201, description: 'Commande créée' })
  @ApiResponse({ status: 400, description: 'Plat indisponible ou invalide' })
  async create(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.create(userId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @Get('me')
  @ApiOperation({ summary: 'Historique de mes commandes (CLIENT)' })
  @ApiResponse({ status: 200, description: 'Commandes retournées' })
  async findMyOrders(@CurrentUser('sub') userId: string) {
    return this.ordersService.findMyOrders(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'une commande (client ou owner concerné)' })
  @ApiResponse({ status: 200, description: 'Commande retournée' })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  @ApiResponse({ status: 404, description: 'Commande non trouvée' })
  async findOne(
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: Role,
    @Param('id', ParseUuidPipe) id: string,
  ) {
    return this.ordersService.findOne(userId, role, id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.RESTAURANT_OWNER)
  @Get('restaurant')
  @ApiOperation({ summary: 'Commandes reçues par mon restaurant (OWNER)' })
  @ApiResponse({ status: 200, description: 'Commandes retournées' })
  async findRestaurantOrders(@CurrentUser('sub') ownerId: string) {
    return this.ordersService.findRestaurantOrders(ownerId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.RESTAURANT_OWNER)
  @Patch(':id/status')
  @ApiOperation({ summary: 'Mettre à jour le statut d\'une commande (OWNER)' })
  @ApiResponse({ status: 200, description: 'Statut mis à jour' })
  @ApiResponse({ status: 400, description: 'Transition de statut invalide' })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  async updateStatus(
    @CurrentUser('sub') ownerId: string,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(ownerId, id, dto);
  }
}
