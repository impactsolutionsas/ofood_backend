import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { RatingsService } from './ratings.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';

@ApiTags('Ratings')
@Controller('ratings')
export class RatingsController {
  constructor(private ratingsService: RatingsService) {}

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @Post()
  @ApiOperation({ summary: 'Noter une commande livrée (CLIENT)' })
  @ApiResponse({ status: 201, description: 'Note créée' })
  @ApiResponse({ status: 400, description: 'Commande non livrée' })
  @ApiResponse({ status: 409, description: 'Déjà notée' })
  async create(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateRatingDto,
  ) {
    return this.ratingsService.create(userId, dto);
  }

  @Public()
  @Get('restaurant/:id')
  @ApiOperation({ summary: 'Avis d\'un restaurant' })
  @ApiResponse({ status: 200, description: 'Avis retournés' })
  @ApiResponse({ status: 404, description: 'Restaurant non trouvé' })
  async findByRestaurant(@Param('id', ParseUuidPipe) id: string) {
    return this.ratingsService.findByRestaurant(id);
  }
}
