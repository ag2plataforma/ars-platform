import { IsString, Matches } from 'class-validator';

export class CreateChannelTypeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codChannelType solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codChannelType!: string;

  @IsString()
  desChannelType!: string;
}
