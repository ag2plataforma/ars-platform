import { IsNumber, IsString } from 'class-validator';

export class CreateSocialImpactConfigDto {
  /** CodProduct del producto que empieza a participar de Impacto Social
   *  (debe existir, y no tener ya una configuración creada). */
  @IsString()
  codProduct!: string;

  /**
   * PLACEHOLDER de Etapa 1 (ver `SocialImpactCalculatorService`):
   * porcentaje aplicado sobre la prima, positivo = recargo, negativo =
   * descuento. Reemplazar cuando se definan las fórmulas reales de
   * SIP (puntos de impacto social) / CFP (huella de carbono) / SP
   * (sostenibilidad).
   */
  @IsNumber()
  pctPrimaAdjustment!: number;
}
