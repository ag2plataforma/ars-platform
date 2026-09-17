import { IsDateString, IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdatePersonDto {
  @IsOptional()
  @IsUUID()
  ideIdentificationType?: string;

  @IsOptional()
  @IsString()
  numIdentification?: string;

  @IsOptional()
  @IsString()
  desFirstName?: string;

  @IsOptional()
  @IsString()
  desMiddleName?: string;

  @IsOptional()
  @IsString()
  desLastName1?: string;

  @IsOptional()
  @IsString()
  desLastName2?: string;

  @IsOptional()
  @IsEmail()
  desEmail?: string;

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
