import { IsNumber, Min, IsEnum, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class RechargeWalletDto {
  @ApiProperty({ example: 1000, minimum: 500 })
  @IsNumber()
  @Min(500)
  amount: number;

  @ApiProperty({ enum: [PaymentMethod.WAVE, PaymentMethod.ORANGE_MONEY, PaymentMethod.FREE_MONEY] })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiProperty({ example: '771234567' })
  @IsString()
  phoneNumber: string;
}
