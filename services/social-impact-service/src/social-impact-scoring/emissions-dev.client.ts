import { Injectable, Logger } from '@nestjs/common';

/**
 * Cliente de la API externa emissions.dev (https://emissions.dev),
 * usada SOLO para el componente eléctrico de la huella de carbono
 * (Etapa 2 de Impacto Social, ver docs/02-roadmap.md): la intensidad de
 * la red eléctrica varía mucho por país (mezcla de renovables/fósiles),
 * así que ahí sí vale la pena una fuente de datos real en vez de un
 * factor fijo -- a diferencia de auto/vuelos, donde se usan factores
 * públicos estables calculados localmente (ver `SocialImpactFormula.
 * cfpFactors` y `SocialImpactScoringService`).
 *
 * CONFIRMADO contra la documentación pública (23/09/2026, después de que
 * la primera versión de este cliente devolviera 403 -- estaba mal en
 * TRES cosas a la vez, mismo patrón confirmado también en el endpoint
 * de `fuel`, así que aplica a toda la API, no solo a electricidad):
 *   1. Método `GET`, no `POST`.
 *   2. Ruta `/v1/electricity/emissions`, no `/v1/electricity/calculate`.
 *   3. Parámetros por QUERY STRING (`?kwh=...&country=...`), no JSON
 *      en el body -- por eso el `Content-Type: application/json` y el
 *      body de la versión anterior no tenían ningún efecto.
 * Forma de la respuesta real: `data.attributes.emissions.co2e` (no
 * `emissions.co2e` en la raíz, como se había asumido antes de probar
 * contra el servicio real).
 */
@Injectable()
export class EmissionsDevClient {
  private readonly logger = new Logger(EmissionsDevClient.name);
  private readonly baseUrl = process.env.EMISSIONS_DEV_BASE_URL ?? 'https://api.emissions.dev/v1';
  private readonly apiKey = process.env.EMISSIONS_DEV_API_KEY;

  /** kg de CO2 equivalente por el consumo eléctrico mensual declarado,
   *  para el país dado (o `null` si la API no está configurada o falla
   *  -- ver `SocialImpactScoringService`, que en ese caso sigue
   *  calculando el resto de la huella sin el componente eléctrico en
   *  vez de romper todo el cálculo). */
  async calculateElectricityKgCo2(kwhPerMonth: number, country: string): Promise<number | null> {
    if (!this.apiKey) {
      this.logger.warn('EMISSIONS_DEV_API_KEY no configurada -- se omite el componente eléctrico de la huella.');
      return null;
    }

    try {
      const url = new URL(`${this.baseUrl}/electricity/emissions`);
      url.searchParams.set('kwh', String(kwhPerMonth * 12));
      url.searchParams.set('country', country);

      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!response.ok) {
        this.logger.error(`emissions.dev respondió ${response.status} para electricity/emissions`);
        return null;
      }

      const data = (await response.json()) as {
        data?: { attributes?: { emissions?: { co2e?: number; co2e_unit?: string } } };
      };
      const co2e = data.data?.attributes?.emissions?.co2e;
      if (typeof co2e !== 'number') {
        this.logger.error('Respuesta inesperada de emissions.dev (sin data.attributes.emissions.co2e numérico)');
        return null;
      }
      // La API documenta co2e_unit "kg" -- si algún día devuelve toneladas
      // ("t"/"tonnes"), esto queda desactualizado a propósito, no se
      // adivina la conversión sin confirmarla contra una respuesta real.
      return co2e;
    } catch (err) {
      this.logger.error(`No se pudo contactar emissions.dev: ${(err as Error).message}`);
      return null;
    }
  }
}
