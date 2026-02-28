import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BroadcastDto {
  @ApiProperty({ example: 'Nouvelle promotion !' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: '-20% sur toutes les commandes ce weekend' })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional({ example: '/client/orders' })
  @IsOptional()
  @IsString()
  url?: string;
}
