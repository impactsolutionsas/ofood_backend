import { IsEnum, IsOptional, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryVehicle } from '@prisma/client';

export class RegisterCourierDto {
  @ApiProperty({ enum: DeliveryVehicle })
  @IsEnum(DeliveryVehicle)
  vehicle: DeliveryVehicle;

  @ApiPropertyOptional({ example: 'DK-1234-AB' })
  @IsOptional()
  @IsString()
  plateNumber?: string;

  @ApiProperty({ example: 'https://storage.example.com/id-card.jpg' })
  @IsString()
  @IsNotEmpty()
  idCardUrl: string;

  @ApiProperty({ example: 'https://storage.example.com/selfie.jpg' })
  @IsString()
  @IsNotEmpty()
  selfieUrl: string;
}
