import { IsString } from 'class-validator';

/**
 * Mismo patrón que `SetCatalogStateDto` en product-rating-service y
 * `SetUserStateDto` en iam-service (duplicado a propósito, no vale la
 * pena una dependencia compartida para 3 líneas -- ver el comentario de
 * `CatalogCrudService` en `@ars-platform/shared-common` para el criterio
 * de qué SÍ vale la pena compartir).
 */
export class SetCatalogStateDto {
  @IsString()
  codState!: string;
}
