import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class UserResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'Moussa' })
  firstName: string;

  @ApiProperty({ example: 'Diop' })
  lastName: string;

  @ApiProperty({ example: '771234567' })
  phone: string;

  @ApiPropertyOptional({ example: 'moussa@email.com', nullable: true })
  email: string | null;

  @ApiProperty({ enum: Role, example: 'CLIENT' })
  role: Role;

  @ApiProperty({ example: true })
  isActive: boolean;

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}
