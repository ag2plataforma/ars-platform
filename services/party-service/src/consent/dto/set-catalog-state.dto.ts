import { IsString } from 'class-validator';

/**
 * Mismo patrón que `SetCatalogStateDto` en otros módulos/servicios --
 * una copia más, a propósito, ver el comentario de `CatalogCrudService`
 * en `@ars-platform/shared-common`.
 */
export class SetCatalogStateDto {
  @IsString()
  codState!: string;
}
