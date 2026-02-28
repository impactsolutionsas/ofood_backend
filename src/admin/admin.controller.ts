import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AdminService } from './admin.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Statistiques globales (ADMIN)' })
  @ApiResponse({ status: 200, description: 'Dashboard retourné' })
  async getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('users')
  @ApiOperation({ summary: 'Liste des utilisateurs (ADMIN)' })
  @ApiResponse({ status: 200, description: 'Utilisateurs retournés' })
  async getUsers() {
    return this.adminService.getUsers();
  }

  @Get('restaurants')
  @ApiOperation({ summary: 'Liste des restaurants (ADMIN)' })
  @ApiResponse({ status: 200, description: 'Restaurants retournés' })
  async getRestaurants() {
    return this.adminService.getRestaurants();
  }

  @Patch('restaurants/:id/verify')
  @ApiOperation({ summary: 'Vérifier/valider un restaurant (ADMIN)' })
  @ApiResponse({ status: 200, description: 'Restaurant vérifié' })
  @ApiResponse({ status: 404, description: 'Restaurant non trouvé' })
  async verifyRestaurant(@Param('id', ParseUuidPipe) id: string) {
    return this.adminService.verifyRestaurant(id);
  }

  @Get('orders')
  @ApiOperation({ summary: 'Toutes les commandes (ADMIN)' })
  @ApiResponse({ status: 200, description: 'Commandes retournées' })
  async getOrders() {
    return this.adminService.getOrders();
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Toutes les transactions (ADMIN)' })
  @ApiResponse({ status: 200, description: 'Transactions retournées' })
  async getTransactions() {
    return this.adminService.getTransactions();
  }
}
