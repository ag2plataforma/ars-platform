import { IsString, Matches } from 'class-validator';

export class CreateProfessionDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codProfession solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codProfession!: string;

  @IsString()
  desProfession!: string;
}
