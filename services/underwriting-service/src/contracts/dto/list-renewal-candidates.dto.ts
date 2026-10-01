import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Paginación de `GET /contracts/renewal-candidates` (Etapa 2 de
 * "Gestión de renovaciones", ver docs/02-roadmap.md) -- deliberadamente
 * sin filtros todavía (alcance "simple" acordado con el usuario para
 * esta primera vuelta de la pantalla "Renovaciones"): el filtro real
 * (ventana de días antes del vencimiento) lo resuelve
 * `RENEWAL_CANDIDATE_WINDOW_DAYS` del backend, no un parámetro de
 * consulta.
 */
export class ListRenewalCandidatesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
