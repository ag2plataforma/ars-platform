import { IsDateString, IsEmail, IsOptional, IsString } from 'class-validator';

/**
 * Suplemento "Cambio de datos Titular/Tomador" (Etapa 5 de "Movimientos
 * y suplementos del contrato", ver docs/02-roadmap.md) -- a diferencia
 * de `AddRiskDto`/`AddCoverageDto`, no toca ninguna prima: solo corrige
 * los datos de una persona (`TPerson`) ya asociada al contrato en rol
 * TOMADOR/TITULAR, pero igual queda registrado como endoso en
 * "Movimientos" -- decisión explícita del usuario (conversación
 * anterior a esta implementación): "necesito que quede como endoso
 * aunque no afecte la prima".
 *
 * Alcance de campos, decisión explícita del usuario (`AskUserQuestion`,
 * 2026-09-29): "Contacto + identidad básica" -- nombre, apellido, email
 * y DNI (SIN tipo de documento, que no se pide en este diálogo) más los
 * mismos tres datos de contacto que ya exige
 * `ContractsService.assertPersonsReadyForIssuance` antes de poder
 * generar un contrato (dirección línea 1, código postal, teléfono
 * móvil) -- así el diálogo reemplaza el valor completo de cada uno, no
 * un patch parcial como `UpdatePersonDto` en `party-service`. Reemplazar
 * directamente A LA PERSONA (cambiar quién es el Tomador/Titular, no
 * solo sus datos) quedó explícitamente fuera de alcance.
 */
export class ChangePersonDataDto {
  @IsString()
  ideContractPerson!: string;

  @IsString()
  ideProductEndorsement!: string;

  @IsDateString()
  tstSupplement!: string;

  @IsString()
  desSupplement!: string;

  @IsString()
  desFirstName!: string;

  @IsOptional()
  @IsString()
  desLastName1?: string;

  @IsEmail()
  desEmail!: string;

  @IsOptional()
  @IsString()
  numIdentification?: string;

  @IsString()
  desAddressLine1!: string;

  @IsOptional()
  @IsString()
  desAddressLine2?: string;

  @IsString()
  codPostal!: string;

  @IsString()
  mobilePhone!: string;
}
