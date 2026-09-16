import { IsString, Matches } from 'class-validator';

export class CreateLimitTypeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codLimitType solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codLimitType!: string;

  @IsString()
  desLimitType!: string;
}
