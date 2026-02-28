import { IsUUID, IsEnum, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class InitiatePaymentDto {
  @ApiProperty({ example: 'uuid-order', description: 'ID de la commande' })
  @IsUUID()
  orderId: string;

  @ApiProperty({ enum: PaymentMethod, example: 'WAVE', description: 'Moyen de paiement' })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiProperty({ example: '771234567', description: 'Numéro de téléphone pour le paiement' })
  @IsString()
  phoneNumber: string;
}
