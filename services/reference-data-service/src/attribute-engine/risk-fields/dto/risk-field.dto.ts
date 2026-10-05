import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export const RISK_FIELD_TYPES = ['text', 'number', 'date', 'select', 'radio', 'checkbox'] as const;
export type RiskFieldType = (typeof RISK_FIELD_TYPES)[number];

export class CreateRiskFieldDto {
  /** `IdeRiskProduct` al que se le agrega el campo personalizado. */
  @IsUUID()
  ideRiskProduct!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;

  @IsIn(RISK_FIELD_TYPES)
  type!: RiskFieldType;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  /** Solo `number`. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  min?: number;

  /** Solo `number`. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  max?: number;

  /** Solo `text`. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxLength?: number;

  /** `select`/`radio`: opciones nuevas (se guardan como un diccionario propio de este campo). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  /** `select`/`radio`: en lugar de `options`, reutilizar un diccionario de valores existente (ej. razas). */
  @IsOptional()
  @IsString()
  codFieldDictionary?: string;
}

export class UpdateRiskFieldDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  min?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  max?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxLength?: number | null;

  /** Lista COMPLETA de opciones (solo diccionarios propios del campo): las que falten se desactivan. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];
}
