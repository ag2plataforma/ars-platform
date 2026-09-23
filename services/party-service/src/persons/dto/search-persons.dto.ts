import { IsString, MinLength } from 'class-validator';

/**
 * Búsqueda por nombre, complementaria a `LookupPersonDto`
 * (`FPerson_GetBy`, coincidencia exacta por DNI/email -- pensada para
 * un único resultado). Acá se busca por texto libre, puede devolver
 * varias personas -- pantalla de Corredores (selector de `TPerson`),
 * pedido explícito del usuario tras probar esa pantalla.
 */
export class SearchPersonsDto {
  @IsString()
  @MinLength(2, { message: 'q debe tener al menos 2 caracteres' })
  q!: string;
}
