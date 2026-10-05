import { IsIn, IsOptional, IsString } from 'class-validator';

/** Acciones que pueden exigir consentimientos (hoy solo la landing de pago). */
export const CONSENT_ACTIONS = ['PAGO'] as const;

export class CreateProductConsentDto {
  /** Producto al que se le exige el consentimiento. */
  @IsString()
  codProduct!: string;

  /** Consentimiento del catálogo `SConsent` (party-service). */
  @IsString()
  codConsent!: string;

  /** Acción que lo exige (default `PAGO`). */
  @IsOptional()
  @IsIn(CONSENT_ACTIONS as unknown as string[])
  codAction?: string;
}
