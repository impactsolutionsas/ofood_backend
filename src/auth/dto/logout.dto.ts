import { IsOptional, IsString, IsNotEmpty } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class LogoutDto {
  @ApiPropertyOptional({ example: 'eyJhbGciOiJIUzI1NiIs...', description: 'Refresh token à invalider' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  refreshToken?: string;
}
