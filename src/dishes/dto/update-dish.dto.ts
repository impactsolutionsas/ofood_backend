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
import { Transform } from 'class-transformer';

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
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber()
  @IsPositive()
  price?: number;

  @ApiPropertyOptional({ example: 'https://example.com/thieb.jpg' })
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
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isAvailable?: boolean;
}
