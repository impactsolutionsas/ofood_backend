import { IsNumber, IsOptional, IsEnum, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { DishCategory } from '@prisma/client';

export class QueryDishesDto {
  @ApiPropertyOptional({ example: 14.7167, description: 'Latitude du client' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ example: -17.4677, description: 'Longitude du client' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional({ example: 5, description: 'Rayon en km (défaut: 1)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  radius?: number;

  @ApiPropertyOptional({ enum: DishCategory, example: 'LUNCH' })
  @IsOptional()
  @IsEnum(DishCategory)
  category?: DishCategory;

  @ApiPropertyOptional({ description: 'Filtrer par restaurant' })
  @IsOptional()
  @IsUUID()
  restaurantId?: string;
}
