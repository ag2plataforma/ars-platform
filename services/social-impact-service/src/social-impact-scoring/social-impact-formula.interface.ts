/**
 * Forma de `SSocialImpactScoring.FormulaJSON` -- la fórmula real de
 * Impacto Social (Etapa 2, ver docs/02-roadmap.md), aprobada por el
 * usuario como punto de partida (2026-09-22) y editable después vía
 * `PATCH /social-impact-scoring`, sin deploy. Mismo criterio que
 * `SCalculationRule.FormulaJSON`: fórmula real guardada como JSON,
 * validada y evaluada en código.
 */
export interface CfpBand {
  /** Límite superior de kg CO2/año para este tramo (inclusive). `null`
   *  en el último tramo = sin límite superior. Los tramos deben venir
   *  ordenados de menor a mayor `maxKgCo2`. */
  maxKgCo2: number | null;
  points: number;
}

export interface SocialImpactFormula {
  cfpBands: CfpBand[];
  cfpFactors: {
    /** kg CO2 por km, por tipo de combustible declarado en el
     *  formulario (`carFuelType`). Cálculo LOCAL, no vía API externa --
     *  son factores públicos bastante estables, a diferencia de la
     *  intensidad de la red eléctrica (sí varía mucho por país). */
    carKgPerKm: Record<string, number>;
    /** kg CO2 promedio por vuelo ida-y-vuelta declarado (estimación
     *  genérica, no por ruta real). */
    avgFlightKg: number;
  };
  electricity: {
    /** País usado para consultar la intensidad de red eléctrica real
     *  (emissions.dev) cuando no se conoce el país del cliente. */
    defaultCountry: string;
  };
  sipWeights: {
    pointsPerVolunteerHour: number;
    maxVolunteerHours: number;
    recurringCauseBonus: number;
    donationBonus: number;
  };
  /** Pesos del score combinado -- deberían sumar 1 (no se valida
   *  estrictamente, pero es la expectativa). */
  combinedWeights: { cfp: number; sip: number };
  /** Tramos del score combinado (0-100) -> % de ajuste de prima
   *  (negativo = descuento). Deben venir ordenados y sin huecos. */
  scoreTiers: Array<{ minScore: number; maxScore: number; pctPrimaAdjustment: number }>;
}
