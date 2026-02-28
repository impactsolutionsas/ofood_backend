import { Controller, Get, Put, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { MenusService } from './menus.service';
import { SetWeeklyMenuDto } from './dto/set-weekly-menu.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';

@ApiTags('Menus')
@Controller()
export class MenusController {
  constructor(private menusService: MenusService) {}

  @Public()
  @Get('restaurants/:id/menus')
  @ApiOperation({ summary: 'Menu de la semaine d\'un restaurant' })
  @ApiResponse({ status: 200, description: 'Menus retournés' })
  @ApiResponse({ status: 404, description: 'Restaurant non trouvé' })
  async getWeeklyMenu(@Param('id', ParseUuidPipe) id: string) {
    return this.menusService.getWeeklyMenu(id);
  }

  @Public()
  @Get('restaurants/:id/menus/today')
  @ApiOperation({ summary: 'Menu du jour d\'un restaurant' })
  @ApiResponse({ status: 200, description: 'Menu du jour retourné' })
  @ApiResponse({ status: 404, description: 'Restaurant non trouvé' })
  async getTodayMenu(@Param('id', ParseUuidPipe) id: string) {
    return this.menusService.getTodayMenu(id);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.RESTAURANT_OWNER)
  @Put('restaurants/:id/menus')
  @ApiOperation({ summary: 'Configurer le menu de la semaine (OWNER)' })
  @ApiResponse({ status: 200, description: 'Menus mis à jour' })
  @ApiResponse({ status: 403, description: 'Pas le propriétaire' })
  @ApiResponse({ status: 400, description: 'Plats invalides' })
  async setWeeklyMenu(
    @CurrentUser('sub') ownerId: string,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: SetWeeklyMenuDto,
  ) {
    return this.menusService.setWeeklyMenu(ownerId, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.RESTAURANT_OWNER)
  @Patch('menu-items/:id/toggle')
  @ApiOperation({ summary: 'Basculer disponibilité d\'un élément de menu (OWNER)' })
  @ApiResponse({ status: 200, description: 'Disponibilité basculée' })
  @ApiResponse({ status: 403, description: 'Pas le propriétaire' })
  @ApiResponse({ status: 404, description: 'Élément non trouvé' })
  async toggleMenuItem(
    @CurrentUser('sub') ownerId: string,
    @Param('id', ParseUuidPipe) id: string,
  ) {
    return this.menusService.toggleMenuItem(ownerId, id);
  }
}
