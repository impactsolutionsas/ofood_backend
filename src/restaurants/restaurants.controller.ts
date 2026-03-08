import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { RestaurantsService } from './restaurants.service';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { QueryRestaurantsDto } from './dto/query-restaurants.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';

@ApiTags('Restaurants')
@Controller('restaurants')
export class RestaurantsController {
  constructor(private restaurantsService: RestaurantsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liste des restaurants (filtre géo optionnel)' })
  @ApiResponse({ status: 200, description: 'Liste retournée' })
  async findAll(@Query() query: QueryRestaurantsDto) {
    return this.restaurantsService.findAll(query);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.RESTAURANT_OWNER)
  @Get(':id/stats')
  @ApiOperation({ summary: 'Statistiques de ventes du restaurant (OWNER)' })
  @ApiResponse({ status: 200, description: 'Stats retournées' })
  @ApiResponse({ status: 403, description: 'Pas le propriétaire' })
  async getStats(
    @CurrentUser('sub') ownerId: string,
    @Param('id', ParseUuidPipe) id: string,
  ) {
    return this.restaurantsService.getStats(ownerId, id);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.RESTAURANT_OWNER)
  @Get(':id/analytics')
  @ApiOperation({ summary: 'Analyses de ventes détaillées (OWNER)' })
  @ApiResponse({ status: 200, description: 'Analytics retournées' })
  async getAnalytics(
    @CurrentUser('sub') ownerId: string,
    @Param('id', ParseUuidPipe) id: string,
  ) {
    return this.restaurantsService.getAnalytics(ownerId, id);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.RESTAURANT_OWNER)
  @Get(':id/wallet')
  @ApiOperation({ summary: 'Solde et historique transactions' })
  @ApiResponse({ status: 200, description: 'Wallet retourné' })
  @ApiResponse({ status: 403, description: 'Pas le propriétaire' })
  async getWallet(
    @CurrentUser('sub') ownerId: string,
    @Param('id', ParseUuidPipe) id: string,
  ) {
    return this.restaurantsService.getWallet(ownerId, id);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'un restaurant' })
  @ApiResponse({ status: 200, description: 'Restaurant retourné' })
  @ApiResponse({ status: 404, description: 'Restaurant non trouvé' })
  async findOne(@Param('id', ParseUuidPipe) id: string) {
    return this.restaurantsService.findOne(id);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.RESTAURANT_OWNER)
  @Post()
  @UseInterceptors(FileInterceptor('logo'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Créer son restaurant (OWNER uniquement)' })
  @ApiResponse({ status: 201, description: 'Restaurant créé' })
  @ApiResponse({ status: 409, description: 'Vous avez déjà un restaurant' })
  async create(
    @CurrentUser('sub') ownerId: string,
    @Body() dto: CreateRestaurantDto,
    @UploadedFile() logo?: Express.Multer.File,
  ) {
    return this.restaurantsService.create(ownerId, dto, logo);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.RESTAURANT_OWNER)
  @Patch(':id')
  @UseInterceptors(FileInterceptor('logo'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Modifier son restaurant' })
  @ApiResponse({ status: 200, description: 'Restaurant mis à jour' })
  @ApiResponse({ status: 403, description: 'Pas le propriétaire' })
  async update(
    @CurrentUser('sub') ownerId: string,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateRestaurantDto,
    @UploadedFile() logo?: Express.Multer.File,
  ) {
    return this.restaurantsService.update(ownerId, id, dto, logo);
  }
}
