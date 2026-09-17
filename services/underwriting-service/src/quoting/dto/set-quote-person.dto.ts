import { IsString, IsUUID } from 'class-validator';

export class SetQuotePersonDto {
  @IsUUID()
  idePerson!: string;

  /** CodPersonRol (ej. "TOMADOR", "TITULAR", "BENEFICIARIO", "ASEGURADO") -- debe existir en SPersonRol (party-service). */
  @IsString()
  codPersonRol!: string;
}
