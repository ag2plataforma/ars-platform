import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Filtros/paginación de `GET /quotes` (plural) -- pedido explícito del
 * usuario al probar la Etapa 1 de Cotización: hasta ahora
 * `underwriting-service` solo exponía `GET /quotes/:id` (una por id), sin
 * forma de listar ni retomar una cotización ya creada (ver
 * docs/02-roadmap.md, Fase 2).
 *
 * Mismo patrón `page`/`limit` ya usado en `iam-service`
 * (`ListUsersDto`/`UsersService.findAll`) -- no hay un helper de
 * paginación compartido en el monorepo todavía, así que se replica tal
 * cual en vez de inventar `skip`/`take` u otro shape.
 */
export class ListQuotesDto {
  /** `SProduct.CodProduct` -- mismo criterio de "código, no uuid" que el
   *  resto del módulo (ver `CreateQuoteDto`). */
  @IsOptional()
  @IsString()
  codProduct?: string;

  /** `SState.CodState` de `TQuote` -- hoy son los códigos de prueba
   *  `SEED_BORRADOR`/`ACEPTADO`/`SEED_CONTRATADO` (ver
   *  `seed-contract-testing-fixtures.js`), no los del legado -- punto
   *  abierto ya documentado en el roadmap, no bloquea este filtro. */
  @IsOptional()
  @IsString()
  codState?: string;

  /** Filtra por `TQuote.TstCreation >= dateFrom` (inclusive). */
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  /** Filtra por `TQuote.TstCreation <= dateTo` (inclusive). */
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  /**
   * Por defecto (omitido o `false`) solo trae las cotizaciones creadas
   * por el usuario logueado (`TQuote.UsrCreation = actor.code`, mismo
   * código que ya graba `create()`/todas las mutaciones de este módulo)
   * -- decisión explícita del usuario (ver docs/02-roadmap.md): `TQuote`
   * no tiene columna de vendedor/usuario, pero `UsrCreation` ya alcanza,
   * sin tocar el esquema. `all=true` quita ese filtro y trae todas.
   *
   * Transform manual (no `@Type(() => Boolean)`): `Boolean("false")` es
   * `true` en JS -- ese es justo el caso a evitar acá, así que se
   * compara el string explícitamente en vez de confiar en la coerción
   * por defecto de class-transformer.
   */
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

  /** Orden de columna (`p-table` de PrimeNG) -- mismo patrón que
   *  `ListContractsDto.sortField`, agregado el 23/09/2026 al retrofit del
   *  estándar de orden/filtro/pie de página al resto de las tablas de la
   *  app (ver docs/02-roadmap.md). Ver `QuotesService.resolveOrderBy`
   *  para la lista cerrada de columnas ordenables. */
  @IsOptional()
  @IsString()
  sortField?: string;

  /** `1` = ascendente, `-1` = descendente -- mismo criterio que el
   *  `sortOrder` nativo de `p-table`. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  /** Filtro de columna (`p-columnFilter`) sobre `NumQuote` -- mismo
   *  criterio que `ListContractsDto.filterNumContract` (el único filtro
   *  de columna que no duplica uno ya existente en el formulario de
   *  arriba, producto/estado). */
  @IsOptional()
  @IsString()
  filterNumQuote?: string;
}
