import { IsDateString, IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Las FKs demográficas secundarias (tipo de identificación, género,
 * país/localidad de nacimiento, profesión, actividad económica, estado
 * civil) se aceptan como uuid crudo sin resolver por código ni validar
 * existencia -- mismo criterio ya usado para `SModelAttribute.IdeReference`
 * en el motor de atributos: no hay todavía (ni se justifica en esta
 * fase) un catálogo CRUD propio para `SIdentificationType`/`SGender`/
 * `SCountry`/`SLocation`/`SProfession`/`SBusinessActivity`/`SMaritalStatus`.
 */
export class CreatePersonDto {
  @IsOptional()
  @IsUUID()
  ideIdentificationType?: string;

  @IsOptional()
  @IsString()
  numIdentification?: string;

  @IsString()
  desFirstName!: string;

  @IsOptional()
  @IsString()
  desMiddleName?: string;

  @IsOptional()
  @IsString()
  desLastName1?: string;

  @IsOptional()
  @IsString()
  desLastName2?: string;

  @IsEmail()
  desEmail!: string;

  @IsOptional()
  @IsUUID()
  ideGender?: string;

  @IsOptional()
  @IsDateString()
  tstBirthdate?: string;

  @IsOptional()
  @IsString()
  desBirthPlace?: string;

  @IsOptional()
  @IsUUID()
  ideCountryBirth?: string;

  @IsOptional()
  @IsUUID()
  ideLocationBirth?: string;

  @IsOptional()
  @IsUUID()
  ideProfession?: string;

  @IsOptional()
  @IsUUID()
  ideBusinessActivity?: string;

  @IsOptional()
  @IsUUID()
  ideMaritalStatus?: string;

  @IsOptional()
  @IsString()
  objCustomData?: string;

  @IsOptional()
  @IsString()
  codExternal?: string;
}
