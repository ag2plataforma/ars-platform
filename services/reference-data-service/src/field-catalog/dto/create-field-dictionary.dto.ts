import { IsString, Matches } from 'class-validator';

export class CreateFieldDictionaryDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codFieldDictionary solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codFieldDictionary!: string;

  @IsString()
  desFieldDictionary!: string;
}
