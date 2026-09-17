import { IsString, Matches } from 'class-validator';

export class CreateStepDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codStep solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codStep!: string;

  @IsString()
  desStep!: string;
}
