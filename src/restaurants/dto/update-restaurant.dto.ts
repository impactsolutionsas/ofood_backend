import {
  IsString,
  IsNumber,
  IsOptional,
  IsUrl,
  IsLatitude,
  IsLongitude,
  IsPositive,
  IsBoolean,
  MinLength,
} from 'class-validator';
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
  @IsNumber()
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: -17.4441 })
  @IsOptional()
  @IsNumber()
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ example: 'Restaurant sénégalais traditionnel' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @ApiPropertyOptional({ example: 'https://res.cloudinary.com/ofood/logo.jpg' })
  @IsOptional()
  @IsString()
  @IsUrl()
  logoUrl?: string;

  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  avgPrepTime?: number;

  @ApiPropertyOptional({ example: '50 plats/jour' })
  @IsOptional()
  @IsString()
  dailyCapacity?: string;

  @ApiPropertyOptional({ example: true, description: 'Ouvrir/fermer le restaurant' })
  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;
}
