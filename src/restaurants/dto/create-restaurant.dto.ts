import {
  IsString,
  IsNumber,
  IsOptional,
  IsLatitude,
  IsLongitude,
  IsPositive,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRestaurantDto {
  @ApiProperty({ example: 'Chez Fatou' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'Rue 10, Médina, Dakar' })
  @IsString()
  @MinLength(1)
  address: string;

  @ApiPropertyOptional({ example: 14.6937, description: 'Latitude (optionnel si adresse fournie — sera géocodée)' })
  @IsOptional()
  @Transform(({ value }) => value !== undefined && value !== '' ? parseFloat(value) : undefined)
  @IsNumber()
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: -17.4441, description: 'Longitude (optionnel si adresse fournie — sera géocodée)' })
  @IsOptional()
  @Transform(({ value }) => value !== undefined && value !== '' ? parseFloat(value) : undefined)
  @IsNumber()
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ example: 'Restaurant sénégalais traditionnel' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'https://...', description: 'URL du logo (auto si fichier uploadé)' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ example: 25, description: 'Temps de préparation moyen (minutes)' })
  @IsOptional()
  @Transform(({ value }) => value ? parseInt(value, 10) : undefined)
  @IsNumber()
  @IsPositive()
  avgPrepTime?: number;

  @ApiProperty({ example: '50 plats/jour' })
  @IsString()
  dailyCapacity: string;
}
