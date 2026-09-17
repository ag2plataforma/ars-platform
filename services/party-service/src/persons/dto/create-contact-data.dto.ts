import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateContactDataDto {
  /** CodContactClass del tipo de contacto (ej. "EMAIL", "TELEFONO_MOVIL") -- debe existir en SContactClass. */
  @IsString()
  codContactClass!: string;

  @IsString()
  desContactData!: string;

  /** Igual regla que en direcciones: marcar principal desmarca los demás de la misma clase para esta persona. */
  @IsOptional()
  @IsBoolean()
  indMain?: boolean;
}
