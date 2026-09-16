import { IsString } from 'class-validator';

export class SetUserStateDto {
  /** Cualquier CodState existente en el catálogo SState (ej. ACTIVO, INACTIVO). */
  @IsString()
  codState!: string;
}
