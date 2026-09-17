import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Equivalente a `FPerson_GetBy` -- confirmado contra el código real
 * (`packages/database/scripts/investigate-party-service.js`): si se
 * envía más de un criterio, TODOS deben matchear a la vez (es un AND,
 * no una búsqueda "por cualquiera de estos" -- el `coalesce` del
 * original hace que un parámetro omitido no restrinja la búsqueda,
 * pero uno enviado sí exige matchear exacto). Enviar un único criterio
 * funciona como búsqueda simple por ese campo.
 */
export class LookupPersonDto {
  @IsOptional()
  @IsUUID()
  idePerson?: string;

  @IsOptional()
  @IsString()
  numIdentification?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
