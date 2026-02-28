import { IsNumber, IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class QueryRestaurantsDto {
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

  @ApiPropertyOptional({ example: 5, description: 'Rayon de recherche en km (défaut: 1)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  radius?: number;

  @ApiPropertyOptional({ example: true, description: 'Filtrer par statut ouvert' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isOpen?: boolean;
}
