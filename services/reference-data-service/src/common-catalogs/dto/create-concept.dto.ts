import { IsOptional, IsString, Matches } from 'class-validator';

export class CreateConceptDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codConcept solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codConcept!: string;

  @IsString()
  desConcept!: string;

  /** CodConceptType del tipo de concepto al que pertenece (debe existir). */
  @IsString()
  codConceptType!: string;

  @IsOptional()
  @IsString()
  desShort?: string;

  @IsOptional()
  @IsString()
  desLarge?: string;
}
