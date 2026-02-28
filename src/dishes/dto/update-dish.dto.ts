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
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DishCategory } from '@prisma/client';

export class UpdateDishDto {
  @ApiPropertyOptional({ example: 'Thiéboudienne' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ example: 'Riz au poisson traditionnel sénégalais' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 2500 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  price?: number;

  @ApiPropertyOptional({ example: 'https://res.cloudinary.com/ofood/thieb.jpg' })
  @IsOptional()
  @IsString()
  @IsUrl()
  photoUrl?: string;

  @ApiPropertyOptional({ enum: DishCategory, example: 'LUNCH' })
  @IsOptional()
  @IsEnum(DishCategory)
  category?: DishCategory;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
