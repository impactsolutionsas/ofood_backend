import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
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
}
