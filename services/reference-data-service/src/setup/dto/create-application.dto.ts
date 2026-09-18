import { IsString, Matches } from 'class-validator';

export class CreateApplicationDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codApplication solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codApplication!: string;

  @IsString()
  desApplication!: string;
}
