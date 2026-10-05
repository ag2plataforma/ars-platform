import { IsIn, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

/**
 * Cómo se activa un contrato (popup "Activar" del backoffice):
 * - `MANUAL`: "Activar sin pasar por pasarela de pago" -- activa el contrato
 *   y marca el primer recibo como cobrado. El operador deja un motivo
 *   (obligatorio: queda en `TPayment.DesReason` como evidencia de auditoría).
 * - `PAYMENT_LINK` (etapa 2, todavía no disponible): "Enviar landing de pago
 *   al cliente" -- el contrato sigue en Borrador hasta que la pasarela
 *   confirme el cobro.
 */
export const ACTIVATE_MODES = ['MANUAL'] as const;
export type ActivateMode = (typeof ACTIVATE_MODES)[number];

export class ActivateContractDto {
  @IsIn(ACTIVATE_MODES as unknown as string[])
  mode!: ActivateMode;

  @ValidateIf((o: ActivateContractDto) => o.mode === 'MANUAL')
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  desReason!: string;
}
