import { IsUUID, IsEnum, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class InitiatePaymentDto {
  @ApiProperty({ example: 'uuid-order', description: 'ID de la commande' })
  @IsUUID()
  orderId: string;

  @ApiProperty({ enum: PaymentMethod, example: 'WAVE', description: 'Moyen de paiement' })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ example: '771234567', description: 'Numéro de téléphone (requis sauf Orange Money)' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;
}
