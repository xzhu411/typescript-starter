import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Alice' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
