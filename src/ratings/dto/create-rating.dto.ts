import { IsUUID, IsInt, Min, Max, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRatingDto {
  @ApiProperty({ example: 'uuid-order', description: 'ID de la commande livrée' })
  @IsUUID()
  orderId: string;

  @ApiProperty({ example: 4, description: 'Note de 1 à 5 étoiles' })
  @IsInt()
  @Min(1)
  @Max(5)
  stars: number;

  @ApiPropertyOptional({ example: 'Très bon repas !', description: 'Commentaire optionnel' })
  @IsOptional()
  @IsString()
  comment?: string;
}
