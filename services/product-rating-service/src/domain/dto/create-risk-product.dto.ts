import { IsDateString, IsObject, IsOptional, IsString, Matches } from 'class-validator';

export class CreateRiskProductDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codRiskProduct solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codRiskProduct!: string;

  @IsOptional()
  @IsString()
  desShort?: string;

  @IsOptional()
  @IsString()
  desLarge?: string;

  @IsOptional()
  @IsString()
  image?: string;

  /** CodProduct del producto al que pertenece (debe existir). */
  @IsString()
  codProduct!: string;

  /** CodRisk del riesgo asegurado (debe existir). */
  @IsString()
  codRisk!: string;

  /** CodRiskType del tipo de riesgo (debe existir). */
  @IsString()
  codRiskType!: string;

  @IsDateString()
  tstInitial!: string;

  @IsOptional()
  @IsDateString()
  tstEnd?: string;

  /**
   * Datos de la persona asegurada que se piden al contratar este riesgo (solo si el riesgo es de tipo persona):
   * `{ firstName|middleName|lastName1|lastName2|document|birthdate|gender|maritalStatus|profession|birthPlace|email: 'NONE'|'OPTIONAL'|'REQUIRED' }`.
   */
  @IsOptional()
  @IsObject()
  insuredPersonFields?: Record<string, string>;
}
