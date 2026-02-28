import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { DishesService } from './dishes.service';
import { CreateDishDto } from './dto/create-dish.dto';
import { UpdateDishDto } from './dto/update-dish.dto';
import { QueryDishesDto } from './dto/query-dishes.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';

@ApiTags('Dishes')
@Controller()
export class DishesController {
  constructor(private dishesService: DishesService) {}

  @Public()
  @Get('dishes')
  @ApiOperation({ summary: 'Liste des plats (filtre géo + catégorie)' })
  @ApiResponse({ status: 200, description: 'Liste retournée' })
  async findAll(@Query() query: QueryDishesDto) {
    return this.dishesService.findAll(query);
  }

  @Public()
  @Get('dishes/:id')
  @ApiOperation({ summary: 'Détail d\'un plat' })
  @ApiResponse({ status: 200, description: 'Plat retourné' })
  @ApiResponse({ status: 404, description: 'Plat non trouvé' })
  async findOne(@Param('id', ParseUuidPipe) id: string) {
    return this.dishesService.findOne(id);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.RESTAURANT_OWNER)
  @Post('restaurants/:restaurantId/dishes')
  @ApiOperation({ summary: 'Ajouter un plat à son restaurant (OWNER)' })
  @ApiResponse({ status: 201, description: 'Plat créé' })
  @ApiResponse({ status: 403, description: 'Pas le propriétaire' })
  async create(
    @CurrentUser('sub') ownerId: string,
    @Param('restaurantId', ParseUuidPipe) restaurantId: string,
    @Body() dto: CreateDishDto,
  ) {
    return this.dishesService.create(ownerId, restaurantId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.RESTAURANT_OWNER)
  @Patch('dishes/:id')
  @ApiOperation({ summary: 'Modifier un plat (OWNER)' })
  @ApiResponse({ status: 200, description: 'Plat mis à jour' })
  @ApiResponse({ status: 403, description: 'Pas le propriétaire' })
  async update(
    @CurrentUser('sub') ownerId: string,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateDishDto,
  ) {
    return this.dishesService.update(ownerId, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.RESTAURANT_OWNER)
  @Delete('dishes/:id')
  @ApiOperation({ summary: 'Supprimer un plat (OWNER)' })
  @ApiResponse({ status: 200, description: 'Plat supprimé' })
  @ApiResponse({ status: 403, description: 'Pas le propriétaire' })
  async remove(
    @CurrentUser('sub') ownerId: string,
    @Param('id', ParseUuidPipe) id: string,
  ) {
    return this.dishesService.remove(ownerId, id);
  }
}
