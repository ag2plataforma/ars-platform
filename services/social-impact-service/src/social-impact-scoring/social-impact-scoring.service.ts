import { Injectable, Logger } from '@nestjs/common';
import { CalculateSocialImpactScoreDto } from './dto/calculate-social-impact-score.dto';
import { EmissionsDevClient } from './emissions-dev.client';
import { SocialImpactScoringConfigService } from './social-impact-scoring-config.service';
import { CfpBand, SocialImpactFormula } from './social-impact-formula.interface';

export interface SocialImpactScoreResult {
  kgCo2Year: number;
  cfpScore: number;
  sipScore: number;
  combinedScore: number;
  pctPrimaAdjustment: number;
  /** `false` si emissions.dev no está configurada o falló -- el
   *  componente eléctrico de la huella quedó en 0 (no se adivina), así
   *  que `kgCo2Year`/`cfpScore` son parciales. El llamador decide si
   *  igual persiste el resultado o le pide al usuario reintentar. */
  electricityDataAvailable: boolean;
}

/**
 * Orquesta el cálculo real de Impacto Social (Etapa 2, ver
 * docs/02-roadmap.md): huella de carbono (CFP, auto+vuelos con factores
 * locales + electricidad vía emissions.dev), puntos de impacto social
 * (SIP, fórmula propia sobre respuestas autodeclaradas), el score
 * combinado, y el % de ajuste de prima resultante -- todo según la
 * fórmula configurable en `SSocialImpactScoring`
 * (`SocialImpactScoringConfigService`), nunca hardcodeado acá.
 *
 * Es un cálculo puro (no persiste nada) -- lo persiste el llamador real
 * (`underwriting-service`, en `TQuoteSocialImpactAnswer`) tal como
 * corresponda a esa cotización.
 */
@Injectable()
export class SocialImpactScoringService {
  private readonly logger = new Logger(SocialImpactScoringService.name);

  constructor(
    private readonly configService: SocialImpactScoringConfigService,
    private readonly emissionsDev: EmissionsDevClient,
  ) {}

  async calculate(dto: CalculateSocialImpactScoreDto): Promise<SocialImpactScoreResult> {
    const formula = await this.configService.getCurrentFormula();

    const carKgYear = this.calculateCarKg(dto, formula);
    const flightsKgYear = dto.flightsPerYear * formula.cfpFactors.avgFlightKg;
    const country = dto.country ?? formula.electricity.defaultCountry;
    const electricityKgYear = await this.emissionsDev.calculateElectricityKgCo2(dto.electricityKwhMonth, country);
    const electricityDataAvailable = electricityKgYear !== null;

    const kgCo2Year = carKgYear + flightsKgYear + (electricityKgYear ?? 0);
    const cfpScore = this.resolveCfpScore(kgCo2Year, formula.cfpBands);
    const sipScore = this.calculateSipScore(dto, formula);
    const combinedScore = this.combineScores(cfpScore, sipScore, formula);
    const pctPrimaAdjustment = this.resolvePctPrimaAdjustment(combinedScore, formula);

    return { kgCo2Year, cfpScore, sipScore, combinedScore, pctPrimaAdjustment, electricityDataAvailable };
  }

  private calculateCarKg(dto: CalculateSocialImpactScoreDto, formula: SocialImpactFormula): number {
    if (dto.carFuelType === 'no_tiene') {
      return 0;
    }
    const factor = formula.cfpFactors.carKgPerKm[dto.carFuelType];
    if (typeof factor !== 'number') {
      this.logger.warn(
        `No hay factor configurado para carFuelType="${dto.carFuelType}" en SSocialImpactScoring -- se toma 0`,
      );
      return 0;
    }
    return dto.carKmPerYear * factor;
  }

  private resolveCfpScore(kgCo2Year: number, bands: CfpBand[]): number {
    const sorted = [...bands].sort((a, b) => {
      if (a.maxKgCo2 === null) return 1;
      if (b.maxKgCo2 === null) return -1;
      return a.maxKgCo2 - b.maxKgCo2;
    });
    const band = sorted.find((b) => b.maxKgCo2 === null || kgCo2Year <= b.maxKgCo2);
    return band?.points ?? 0;
  }

  private calculateSipScore(dto: CalculateSocialImpactScoreDto, formula: SocialImpactFormula): number {
    const { pointsPerVolunteerHour, maxVolunteerHours, recurringCauseBonus, donationBonus } = formula.sipWeights;
    const cappedHours = Math.min(dto.volunteerHoursPerYear, maxVolunteerHours);
    const rawPoints =
      cappedHours * pointsPerVolunteerHour +
      (dto.recurringCause ? recurringCauseBonus : 0) +
      (dto.regularDonations ? donationBonus : 0);
    const maxRawPoints = maxVolunteerHours * pointsPerVolunteerHour + recurringCauseBonus + donationBonus;
    if (maxRawPoints <= 0) {
      return 0;
    }
    return Math.min(100, (rawPoints / maxRawPoints) * 100);
  }

  private combineScores(cfpScore: number, sipScore: number, formula: SocialImpactFormula): number {
    const { cfp, sip } = formula.combinedWeights;
    const totalWeight = cfp + sip;
    if (totalWeight <= 0) {
      return 0;
    }
    // Normalizado por si los pesos configurados no suman exactamente 1.
    return (cfpScore * cfp + sipScore * sip) / totalWeight;
  }

  private resolvePctPrimaAdjustment(combinedScore: number, formula: SocialImpactFormula): number {
    const tier = formula.scoreTiers.find((t) => combinedScore >= t.minScore && combinedScore <= t.maxScore);
    if (!tier) {
      this.logger.warn(`Ningún tramo de SSocialImpactScoring cubre el score combinado ${combinedScore} -- se toma 0%`);
      return 0;
    }
    return tier.pctPrimaAdjustment;
  }
}
