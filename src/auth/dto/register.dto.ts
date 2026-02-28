import {
  IsString,
  IsOptional,
  IsEnum,
  Matches,
  MinLength,
  MaxLength,
  IsEmail,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'Moussa', description: 'Prénom' })
  @IsString()
  @MinLength(1, { message: 'Le prénom est requis' })
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Diop', description: 'Nom de famille' })
  @IsString()
  @MinLength(1, { message: 'Le nom est requis' })
  @MaxLength(100)
  lastName: string;

  @ApiProperty({ example: '771234567', description: 'Téléphone au format sénégalais' })
  @IsString()
  @Matches(/^(\+221|221)?[0-9]{9}$/, {
    message: 'Le téléphone doit être au format sénégalais (ex: 771234567 ou +221771234567)',
  })
  phone: string;

  @ApiProperty({ example: '1234', description: 'Code PIN (4 à 6 chiffres)' })
  @IsString()
  @Matches(/^[0-9]{4,6}$/, {
    message: 'Le PIN doit contenir 4 à 6 chiffres',
  })
  pin: string;

  @ApiProperty({ enum: Role, example: 'CLIENT', description: 'CLIENT ou RESTAURANT_OWNER' })
  @IsEnum(Role, { message: 'Le rôle doit être CLIENT ou RESTAURANT_OWNER' })
  role: Role;

  @ApiPropertyOptional({ example: 'moussa@email.com' })
  @IsOptional()
  @IsEmail({}, { message: "L'email doit être valide" })
  email?: string;
}
