import { IsString, Matches } from 'class-validator';

export class CreateLanguageDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codLanguage solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codLanguage!: string;

  @IsString()
  desLanguage!: string;
}
