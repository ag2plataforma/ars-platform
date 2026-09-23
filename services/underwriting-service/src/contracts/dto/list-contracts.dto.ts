import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Filtros/paginación de `GET /contracts` (plural) -- mismo patrón que
 * `ListQuotesDto` (ver `../quoting/dto/list-quotes.dto.ts`), pedido
 * explícito del usuario para la pantalla de listado de contratos (ver
 * docs/02-roadmap.md).
 */
export class ListContractsDto {
  /** `SProduct.CodProduct`. */
  @IsOptional()
  @IsString()
  codProduct?: string;

  /** `SState.CodState` de `TContract`. */
  @IsOptional()
  @IsString()
  codState?: string;

  /** Filtra por `TContract.TstCreation >= dateFrom` (inclusive). */
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  /** Filtra por `TContract.TstCreation <= dateTo` (inclusive). */
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  /** Por defecto (omitido o `false`) solo trae los contratos creados por
   *  el usuario logueado (`TContract.UsrCreation = actor.code`) -- mismo
   *  criterio que `ListQuotesDto.all`. `all=true` quita ese filtro. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  all?: boolean = false;

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

  /** Orden de columna, pedido explícito del usuario ("con el componente
   *  de PrimeNG") -- ver `ContractsService.resolveOrderBy` para la lista
   *  cerrada de campos permitidos (no cualquier string arbitrario, para
   *  no exponer nombres de columna de Prisma directamente). */
  @IsOptional()
  @IsString()
  sortField?: string;

  /** `1` = ascendente, `-1` = descendente -- mismo criterio que el
   *  `sortOrder` nativo de `p-table` de PrimeNG. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  /** Filtro de columna (`p-columnFilter`) sobre `NumContract` -- el
   *  único filtro por columna que no duplica un filtro ya existente en
   *  el formulario de arriba (producto/estado). */
  @IsOptional()
  @IsString()
  filterNumContract?: string;
}
