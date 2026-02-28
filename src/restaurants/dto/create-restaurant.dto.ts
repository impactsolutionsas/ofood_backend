import {
  IsString,
  IsNumber,
  IsOptional,
  IsUrl,
  IsLatitude,
  IsLongitude,
  IsPositive,
  MinLength,
} from 'class-validator';
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
  @IsNumber()
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: -17.4441 })
  @IsNumber()
  @IsLongitude()
  lng: number;

  @ApiProperty({ example: 'Restaurant sénégalais traditionnel' })
  @IsString()
  @MinLength(1)
  description: string;

  @ApiProperty({ example: 'https://res.cloudinary.com/ofood/logo.jpg' })
  @IsString()
  @IsUrl()
  logoUrl: string;

  @ApiPropertyOptional({ example: 25, description: 'Temps de préparation moyen (minutes)' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  avgPrepTime?: number;

  @ApiProperty({ example: '50 plats/jour' })
  @IsString()
  dailyCapacity: string;
}
