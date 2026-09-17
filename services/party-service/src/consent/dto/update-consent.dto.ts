import { IsBoolean, IsDateString, IsInt, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateConsentDto {
  @IsOptional()
  @IsString()
  desConsent?: string;

  /** Enviar '' desasocia el producto (consentimiento pasa a global). */
  @IsOptional()
  @IsString()
  codProduct?: string;

  @IsOptional()
  @IsDateString()
  tstInitial?: string;

  @IsOptional()
  @IsDateString()
  tstEnd?: string;

  @IsOptional()
  @IsObject()
  desConsentContent?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  indMandatory?: boolean;

  @IsOptional()
  @IsInt()
  numOrder?: number;

  @IsOptional()
  @IsUUID()
  ideTextContent?: string;
}
