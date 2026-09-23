import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * Respuestas crudas del formulario de Impacto Social (nuevo paso del
 * wizard de Cotización, ver docs/02-roadmap.md). Duplicado a propósito
 * de `CalculateSocialImpactScoreDto` en `social-impact-service` -- son
 * dos servicios independientes, sin paquete de DTOs compartido entre
 * servicios en este proyecto (a diferencia de `packages/shared-common`,
 * que solo comparte infraestructura -- motor de estados/reglas/auth --
 * nunca DTOs de negocio de un servicio específico), así que este
 * duplicado es intencional en vez de una dependencia cruzada nueva.
 * `QuotesService.submitSocialImpactAnswers` reenvía este cuerpo tal cual
 * a `POST /social-impact-score` de `social-impact-service`.
 */
export class SubmitSocialImpactAnswersDto {
  @IsNumber()
  @Min(0)
  carKmPerYear!: number;

  @IsIn(['gasolina', 'diesel', 'hibrido', 'electrico', 'no_tiene'])
  carFuelType!: 'gasolina' | 'diesel' | 'hibrido' | 'electrico' | 'no_tiene';

  @IsNumber()
  @Min(0)
  electricityKwhMonth!: number;

  @IsNumber()
  @Min(0)
  flightsPerYear!: number;

  @IsNumber()
  @Min(0)
  volunteerHoursPerYear!: number;

  @IsBoolean()
  recurringCause!: boolean;

  @IsBoolean()
  regularDonations!: boolean;

  /** País (ISO 3166-1 alpha-2) para la intensidad de red eléctrica real
   *  vía emissions.dev. Opcional -- si no se manda, `social-impact-service`
   *  usa `SocialImpactFormula.electricity.defaultCountry`. */
  @IsOptional()
  @IsString()
  country?: string;
}
