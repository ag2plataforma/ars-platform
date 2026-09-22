import { IsString } from 'class-validator';

/**
 * Igual que `SetCatalogStateDto` en el resto de los servicios: cualquier
 * `CodState` real del catálogo `SState` (ACTIVO, INACTIVO, etc.),
 * validado en caliente por `StateMachineService.getStateByCode`, nunca
 * hardcodeado acá.
 */
export class SetSocialImpactConfigStateDto {
  @IsString()
  codState!: string;
}
