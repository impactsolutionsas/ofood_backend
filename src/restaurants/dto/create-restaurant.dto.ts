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

  @ApiProperty({ example: 14.6937 })
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: -17.4441 })
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @IsLongitude()
  lng: number;

  @ApiProperty({ example: 'Restaurant sénégalais traditionnel' })
  @IsString()
  @MinLength(1)
  description: string;

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
