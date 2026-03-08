import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
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
  @Get('dishes/today')
  @ApiOperation({ summary: 'Plats du menu du jour (filtre géo + catégorie)' })
  @ApiResponse({ status: 200, description: 'Plats du jour retournés' })
  async findToday(@Query() query: QueryDishesDto) {
    return this.dishesService.findTodayDishes(query);
  }

  @Public()
  @Get('dishes/:id')
  @ApiOperation({ summary: "Détail d'un plat" })
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
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Plat créé' })
  @ApiResponse({ status: 403, description: 'Pas le propriétaire' })
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async create(
    @CurrentUser('sub') ownerId: string,
    @Param('restaurantId', ParseUuidPipe) restaurantId: string,
    @Body() dto: CreateDishDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.dishesService.create(ownerId, restaurantId, dto, photo);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.RESTAURANT_OWNER)
  @Patch('dishes/:id')
  @ApiOperation({ summary: 'Modifier un plat (OWNER)' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'Plat mis à jour' })
  @ApiResponse({ status: 403, description: 'Pas le propriétaire' })
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async update(
    @CurrentUser('sub') ownerId: string,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateDishDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.dishesService.update(ownerId, id, dto, photo);
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
