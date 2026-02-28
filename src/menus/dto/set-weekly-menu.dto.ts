import { IsArray, IsEnum, IsUUID, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { DayOfWeek } from '@prisma/client';

export class MenuDayDto {
  @ApiProperty({ enum: DayOfWeek, example: 'MONDAY' })
  @IsEnum(DayOfWeek)
  dayOfWeek: DayOfWeek;

  @ApiProperty({ example: ['uuid-1', 'uuid-2'], description: 'IDs des plats pour ce jour' })
  @IsArray()
  @IsUUID(undefined, { each: true })
  dishIds: string[];
}

export class SetWeeklyMenuDto {
  @ApiProperty({ type: [MenuDayDto], description: 'Menus par jour de la semaine' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuDayDto)
  menus: MenuDayDto[];
}
