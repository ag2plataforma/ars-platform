import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Filtros/paginación de `GET /persons` (plural) -- pantalla "Personas"
 * (CRM-lite, docs/02-roadmap.md item 6), mismo patrón `page`/`limit`/
 * `sortField`/`sortOrder` que `ListContractsDto`/`ListQuotesDto`. A
 * diferencia de esos dos, no hay filtro `all`/`UsrCreation`: una persona
 * no "pertenece" al usuario que la creó (puede haber sido dada de alta
 * desde Cotización, Corredores, o directamente acá), así que el listado
 * siempre trae todas.
 */
export class ListPersonsDto {
  /** Texto libre -- mismo criterio AND-por-palabra que `PersonsService.search`,
   *  extendido acá a email y documento además de los 4 campos de nombre
   *  (ese método es para un selector acotado a 20 resultados por nombre
   *  solamente; este filtro es para un listado paginado completo). */
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  indLead?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  indClient?: boolean;

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

  @IsOptional()
  @IsString()
  sortField?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}
