import { HttpException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { SubmitSocialImpactAnswersDto } from './dto/submit-social-impact-answers.dto';

/** Forma de la respuesta de `POST /social-impact-score` en
 *  `social-impact-service` -- ver `SocialImpactScoreResult` ahí (mismos
 *  campos, duplicado por la misma razón que `SubmitSocialImpactAnswersDto`,
 *  ver ese archivo). */
export interface SocialImpactScoreResult {
  kgCo2Year: number;
  cfpScore: number;
  sipScore: number;
  combinedScore: number;
  pctPrimaAdjustment: number;
  electricityDataAvailable: boolean;
}

/**
 * Llamada HTTP real a `social-impact-service` (Etapa 2, ver
 * docs/02-roadmap.md) -- primer caso en el proyecto de una llamada
 * directa servicio-a-servicio (todo lo demás hasta ahora comparte el
 * mismo Postgres y se resuelve EN PROCESO vía los puertos de
 * `shared-common`, ver `SocialImpactConfigResolver`). Reenvía el mismo
 * header `Authorization` del usuario que llenó el formulario -- sin
 * credencial service-to-service aparte, decisión explícita del usuario
 * (2026-09-22): `social-impact-service` valida ese JWT con el mismo
 * `AuthModule`/`JWT_SECRET` que todos los demás servicios.
 *
 * Usa el `fetch` global de Node (mismo criterio que `ProxyService` en
 * `gateway`, ver ese archivo) en vez de agregar axios/@nestjs-axios.
 */
@Injectable()
export class SocialImpactHttpClient {
  private readonly logger = new Logger(SocialImpactHttpClient.name);
  private readonly baseUrl = (process.env.SOCIAL_IMPACT_SERVICE_URL ?? 'http://localhost:3008').replace(/\/$/, '');

  async calculateScore(
    dto: SubmitSocialImpactAnswersDto,
    authorization: string,
  ): Promise<SocialImpactScoreResult> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/social-impact-score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authorization,
        },
        body: JSON.stringify(dto),
      });
    } catch (err) {
      this.logger.error(`No se pudo contactar social-impact-service en ${this.baseUrl}: ${(err as Error).message}`);
      throw new ServiceUnavailableException('El servicio de Impacto Social no está disponible en este momento');
    }

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`social-impact-service respondió ${response.status}: ${body}`);
      throw new HttpException(
        `social-impact-service respondió con un error (${response.status})`,
        response.status >= 400 && response.status < 500 ? response.status : 502,
      );
    }

    return (await response.json()) as SocialImpactScoreResult;
  }
}
