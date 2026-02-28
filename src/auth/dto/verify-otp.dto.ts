import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({ example: '771234567', description: 'Téléphone au format sénégalais' })
  @IsString()
  @Matches(/^(\+221|221)?[0-9]{9}$/, {
    message: 'Le téléphone doit être au format sénégalais (ex: 771234567 ou +221771234567)',
  })
  phone: string;

  @ApiProperty({ example: '5678', description: 'Code OTP à 4 chiffres' })
  @IsString()
  @Length(4, 4, { message: "Le code OTP doit contenir exactement 4 chiffres" })
  @Matches(/^[0-9]{4}$/, { message: 'Le code OTP doit être numérique' })
  code: string;
}
