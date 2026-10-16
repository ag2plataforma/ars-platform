import { IsDateString, IsEmail, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Datos de la persona asegurada de un riesgo de tipo persona (se piden al contratar). */
export class InsuredPersonDto {
  @IsOptional()
  @IsUUID()
  ideIdentificationType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  numIdentification?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  desFirstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  desMiddleName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  desLastName1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  desLastName2?: string;

  /** Si no se indica (o se deja vacio) se usa el correo del tomador: el correo NO identifica a la persona. */
  @IsOptional()
  @IsEmail()
  @MaxLength(60)
  desEmail?: string;

  /** `YYYY-MM-DD`. */
  @IsOptional()
  @IsDateString()
  tstBirthdate?: string;

  @IsOptional()
  @IsUUID()
  ideGender?: string;

  @IsOptional()
  @IsUUID()
  ideMaritalStatus?: string;

  @IsOptional()
  @IsUUID()
  ideProfession?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  desBirthPlace?: string;
}
