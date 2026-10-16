import { IsDateString, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateRiskProductDto {
  @IsOptional()
  @IsString()
  desShort?: string;

  @IsOptional()
  @IsString()
  desLarge?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  codProduct?: string;

  @IsOptional()
  @IsString()
  codRisk?: string;

  @IsOptional()
  @IsString()
  codRiskType?: string;

  @IsOptional()
  @IsDateString()
  tstInitial?: string;

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
