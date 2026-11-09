import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Cobro manual de un recibo (cuota 2..N o suplemento) desde el detalle del contrato. El motivo queda en
 * `TPayment.DesReason` como evidencia de auditoría (igual que la activación manual).
 */
export class CollectReceiptDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  desReason!: string;
}
