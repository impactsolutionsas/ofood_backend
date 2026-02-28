import { IsArray, ArrayMinSize, ValidateNested, IsUUID, IsInt, IsPositive, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';

export class OrderItemDto {
  @ApiProperty({ example: 'uuid-dish-1', description: 'ID du plat' })
  @IsUUID()
  dishId: string;

  @ApiProperty({ example: 2, description: 'Quantité' })
  @IsInt()
  @IsPositive()
  quantity: number;
}

export class CreateOrderDto {
  @ApiProperty({ type: [OrderItemDto], description: 'Liste des plats commandés' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiPropertyOptional({ enum: PaymentMethod, example: 'CASH_ON_DELIVERY', description: 'Mode de paiement (optionnel)' })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}
