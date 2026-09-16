import { IsString, Matches } from 'class-validator';

export class CreateRateTableDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codRateTable solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codRateTable!: string;

  @IsString()
  desRateTable!: string;
}
