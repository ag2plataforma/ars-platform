import { ArrayMinSize, IsArray, IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Ver el doc-comment de `ClaimsService.declare`. `ideContractFile` e
 * `ideFileRisks` van directo por id (no por código) porque el frontend
 * ya los tiene resueltos de una llamada previa a `GET /contracts/:id`
 * (`underwriting-service`) -- evita duplicar acá la búsqueda de
 * contrato por `NumContract` que ya existe en ese servicio.
 */
export class DeclareClaimDto {
  /** CodClaimType del tipo de siniestro (debe existir y aplicar al producto del contrato). */
  @IsString()
  codClaimType!: string;

  /** IdeContractFile del expediente de contrato afectado (`TContractFile`, obtenido de `GET /contracts/:id`). */
  @IsUUID()
  ideContractFile!: string;

  /** CodClaimEvent del evento concreto (debe pertenecer al tipo de siniestro indicado). */
  @IsString()
  codClaimEvent!: string;

  /** CodCurrency de la moneda en la que se declara el siniestro. */
  @IsString()
  codCurrency!: string;

  @IsDateString()
  tstOcurrence!: string;

  @IsDateString()
  tstNotification!: string;

  @IsDateString()
  tstConstitution!: string;

  @IsOptional()
  @IsString()
  desLarge?: string;

  /** IdeFileRisk (`TFileRisk`) de cada riesgo afectado -- deben pertenecer a `ideContractFile`. */
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ideFileRisks!: string[];
}
