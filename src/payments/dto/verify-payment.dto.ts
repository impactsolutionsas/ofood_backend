import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyPaymentDto {
  @ApiProperty({ example: 'MOCK-A1B2C3D4', description: 'Référence de la transaction' })
  @IsString()
  reference: string;
}
