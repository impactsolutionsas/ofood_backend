import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WalletPaymentDto {
  @ApiProperty({ example: 'uuid-order-id' })
  @IsUUID()
  orderId: string;
}
