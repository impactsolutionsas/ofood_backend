import { IsString, Length, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConfirmDeliveryDto {
  @ApiProperty({ example: '1234', description: 'Code de confirmation 4 chiffres' })
  @IsString()
  @Length(4, 4)
  confirmationCode: string;

  @ApiPropertyOptional({ example: 'https://storage.example.com/proof.jpg' })
  @IsOptional()
  @IsString()
  proofPhotoUrl?: string;
}
