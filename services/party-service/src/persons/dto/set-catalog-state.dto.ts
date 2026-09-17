import { IsString } from 'class-validator';

/**
 * Mismo patrón que `SetCatalogStateDto` en otros servicios -- una copia
 * más, a propósito, ver el comentario de `CatalogCrudService` en
 * `@ars-platform/shared-common` sobre por qué esto no vale la pena
 * compartirlo.
 */
export class SetCatalogStateDto {
  @IsString()
  codState!: string;
}
