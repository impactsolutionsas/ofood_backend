import {
  IsString,
  IsNumber,
  IsOptional,
  IsUrl,
  IsEnum,
  IsBoolean,
  IsPositive,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DishCategory } from '@prisma/client';

export class CreateDishDto {
  @ApiProperty({ example: 'Thiéboudienne' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({ example: 'Riz au poisson traditionnel sénégalais' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 2500, description: 'Prix en FCFA' })
  @IsNumber()
  @IsPositive()
  price: number;

  @ApiPropertyOptional({ example: 'https://res.cloudinary.com/ofood/thieb.jpg' })
  @IsOptional()
  @IsString()
  @IsUrl()
  photoUrl?: string;

  @ApiProperty({ enum: DishCategory, example: 'LUNCH' })
  @IsEnum(DishCategory, { message: 'La catégorie doit être BREAKFAST, LUNCH, DINNER ou DESSERT' })
  category: DishCategory;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
