import { IsString, Matches } from 'class-validator';

export class CreateFieldValueDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codFieldValue solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codFieldValue!: string;

  @IsString()
  desFieldValue!: string;

  /** CodFieldDictionary del campo al que pertenece este valor (debe existir). */
  @IsString()
  codFieldDictionary!: string;
}
