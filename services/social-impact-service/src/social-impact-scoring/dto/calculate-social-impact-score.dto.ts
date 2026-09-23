import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * Respuestas crudas del formulario de Impacto Social (nuevo paso del
 * wizard de Cotización, ver docs/02-roadmap.md). `underwriting-service`
 * reenvía este mismo cuerpo tal cual a `POST /social-impact-score`.
 */
export class CalculateSocialImpactScoreDto {
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
   *  vía emissions.dev. Opcional -- si no se manda, se usa
   *  `SocialImpactFormula.electricity.defaultCountry`. */
  @IsOptional()
  @IsString()
  country?: string;
}
