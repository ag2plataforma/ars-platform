import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { TEMPLATE_TYPES, TemplateType } from '../../templates/dto/create-template.dto';

/**
 * Generación a demanda de un documento de un contrato.
 *
 * - `CONTRATO`: sin parámetros extra.
 * - `RECIBO`: requiere `ideReceipt` -- un PDF por recibo, elegido de los
 *   recibos del contrato (`GET generation/contracts/:ideContract/receipts`).
 * - `COMUNICADO`: `mensaje` opcional -- texto libre que el operador
 *   escribe al generar; la plantilla lo recibe como `{{mensaje}}`.
 * - `ideContractFile` (opcional, colectivos): genera el documento de UN certificado
 *   (asegurado) en vez del primero del contrato; la plantilla recibe `{{asegurado.*}}`
 *   y `{{numCertificado}}`.
 * - `COTIZACION` NO va por acá (se genera desde la cotización, ver
 *   `GET generation/quotes/:ideQuote/pdf`).
 */
export class GenerateContractDocumentDto {
  @IsIn([...TEMPLATE_TYPES])
  codTemplateType!: TemplateType;

  @IsUUID()
  idePersonRol!: string;

  @IsOptional()
  @IsUUID()
  ideReceipt?: string;

  @IsOptional()
  @IsUUID()
  ideContractFile?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  mensaje?: string;
}
