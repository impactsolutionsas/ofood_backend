import {
  IsString,
  IsNumber,
  IsOptional,
  IsLatitude,
  IsLongitude,
  IsPositive,
  IsBoolean,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateRestaurantDto {
  @ApiPropertyOptional({ example: 'Chez Fatou' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ example: 'Rue 10, Médina, Dakar' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  address?: string;

  @ApiPropertyOptional({ example: 14.6937 })
  @IsOptional()
  @Transform(({ value }) => value !== undefined ? parseFloat(value) : undefined)
  @IsNumber()
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: -17.4441 })
  @IsOptional()
  @Transform(({ value }) => value !== undefined ? parseFloat(value) : undefined)
  @IsNumber()
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ example: 'Restaurant sénégalais traditionnel' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @ApiPropertyOptional({ example: 'https://...' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @Transform(({ value }) => value !== undefined ? parseInt(value, 10) : undefined)
  @IsNumber()
  @IsPositive()
  avgPrepTime?: number;

  @ApiPropertyOptional({ example: '50 plats/jour' })
  @IsOptional()
  @IsString()
  dailyCapacity?: string;

  @ApiPropertyOptional({ example: true, description: 'Ouvrir/fermer le restaurant' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  isOpen?: boolean;
}
