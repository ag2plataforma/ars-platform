import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEmail, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

/**
 * Un asegurado del colectivo. Cada asegurado es una persona del sistema (`TPerson`) -- se
 * reutiliza si ya existe (por correo o por documento) y se crea si no -- y un riesgo de la
 * cotización (`TQuoteRisk`) con sus atributos personalizados.
 */
export class CollectiveInsuredDto {
  /** Código del tipo de documento (`SIdentificationType.CodIdentificationType`); opcional junto con `numIdentification`. */
  @IsOptional()
  @IsString()
  codIdentificationType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  numIdentification?: string;

  @IsString()
  @MaxLength(30)
  desFirstName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  desLastName1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  desLastName2?: string;

  /** El correo es obligatorio: es la clave única de las personas del sistema. */
  @IsEmail()
  @MaxLength(60)
  desEmail!: string;

  /** `YYYY-MM-DD`. */
  @IsOptional()
  @IsString()
  tstBirthdate?: string;

  /** Atributos personalizados del riesgo de este asegurado (`{ "<IdeAttributeProperty>": valor }`). */
  @IsOptional()
  @IsObject()
  riskAttributeValue?: Record<string, string>;
}

export class CreateCollectiveQuoteDto {
  @IsString()
  codProduct!: string;

  @IsString()
  codDistributionChannel!: string;

  @IsString()
  codDistributionWay!: string;

  /** Tipo de riesgo de todos los asegurados (ej. "Persona", "Mascota"). */
  @IsString()
  codRiskProduct!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CollectiveInsuredDto)
  insureds!: CollectiveInsuredDto[];
}

export class SelectCollectivePlanDto {
  /** `SPlanProduct.CodPlanProduct` del plan que se aplica a TODOS los asegurados. */
  @IsString()
  codPlanProduct!: string;
}
