import { IsString } from 'class-validator';

/**
 * Reutilizado por los 8 controllers de catálogo — idéntico a
 * `SetUserStateDto` (iam-service): cualquier `CodState` real del catálogo
 * `SState` (ACTIVO, INACTIVO, etc.), validado en caliente por
 * `StateMachineService.getStateByCode`, nunca hardcodeado aquí.
 */
export class SetCatalogStateDto {
  @IsString()
  codState!: string;
}
