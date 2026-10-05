import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CollectiveInsuredDto } from '../../quoting/dto/create-collective-quote.dto';

/**
 * Colectivos, suplemento "Alta de asegurado": agrega un certificado nuevo (un `TContractFile`
 * con su riesgo y coberturas) a un contrato colectivo ya activo. La persona asegurada se
 * reutiliza si ya existe (por correo o documento) y si no se crea.
 */
export class AddCertificateDto {
  /** Endoso (`SProductEndorsement`) con el que se registra el suplemento, igual que "Alta de riesgo". */
  @IsString()
  ideProductEndorsement!: string;

  @IsDateString()
  tstSupplement!: string;

  @IsString()
  desSupplement!: string;

  /** `SPlanProductRisk` (plan + tipo de riesgo) del asegurado nuevo. */
  @IsString()
  idePlanProductRisk!: string;

  @ValidateNested()
  @Type(() => CollectiveInsuredDto)
  insured!: CollectiveInsuredDto;

  /** Coberturas (`SCoveragePlan`) a dar de alta; si se omite, las obligatorias del plan. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ideCoveragePlans?: string[];
}

/** Colectivos, suplemento "Baja de asegurado": cierra un certificado y devuelve su prima proporcional. */
export class RemoveCertificateDto {
  @IsString()
  ideContractFile!: string;

  @IsString()
  ideProductEndorsement!: string;

  @IsDateString()
  tstSupplement!: string;

  @IsString()
  desSupplement!: string;
}
