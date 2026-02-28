import { IsNumber, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateLocationDto {
  @ApiProperty({ example: 14.6928 })
  @IsNumber()
  lat: number;

  @ApiProperty({ example: -17.4467 })
  @IsNumber()
  lng: number;

  @ApiPropertyOptional({ example: 25.5 })
  @IsOptional()
  @IsNumber()
  speed?: number;
}

export class UpdateDeliveryLocationDto extends UpdateLocationDto {
  @ApiProperty()
  @IsUUID()
  deliveryId: string;
}
