import { IsString } from 'class-validator';

/**
 * Reutilizado por todos los controllers de este módulo -- idéntico al de
 * `field-catalog`/`attribute-engine`: cualquier `CodState` real del
 * catálogo `SState`, validado en caliente por
 * `StateMachineService.getStateByCode`, nunca hardcodeado aquí.
 */
export class SetCatalogStateDto {
  @IsString()
  codState!: string;
}
