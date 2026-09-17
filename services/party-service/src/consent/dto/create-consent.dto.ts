import { IsBoolean, IsDateString, IsInt, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateConsentDto {
  @IsString()
  codConsent!: string;

  @IsString()
  desConsent!: string;

  /** CodProduct del producto al que aplica -- si se omite, es un consentimiento global (aplica a todos los productos). */
  @IsOptional()
  @IsString()
  codProduct?: string;

  @IsDateString()
  tstInitial!: string;

  @IsDateString()
  tstEnd!: string;

  /** Contenido real mostrado al usuario -- JSON libre (label/type/data/isMandatory/etc, ver datos reales investigados), no se valida su forma interna. */
  @IsObject()
  desConsentContent!: Record<string, unknown>;

  @IsBoolean()
  indMandatory!: boolean;

  @IsInt()
  numOrder!: number;

  @IsOptional()
  @IsUUID()
  ideTextContent?: string;
}
