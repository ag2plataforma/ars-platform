import { IsString, Matches } from 'class-validator';

export class CreateCoverageDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codCoverage solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codCoverage!: string;

  @IsString()
  desCoverage!: string;

  /** CodInsuranceLine de la línea de seguro a la que pertenece (debe existir). */
  @IsString()
  codInsuranceLine!: string;
}
