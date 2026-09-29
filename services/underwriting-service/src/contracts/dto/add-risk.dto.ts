import { IsDateString, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Suplemento "Alta de riesgo" (Etapa 4 de "Movimientos y suplementos del
 * contrato", ver docs/02-roadmap.md): agrega un `TFileRisk` nuevo (vacío,
 * sin coberturas todavía) a un certificado (`TContractFile`) que ya
 * existe en el contrato. El usuario elige después qué coberturas darle,
 * reutilizando el mismo botón "Agregar cobertura" de la pestaña
 * Coberturas (Etapa 3) -- decisión de negocio explícita del usuario
 * (2026-09-28): "mismo mecanismo" que alta de cobertura, un paso a la
 * vez, sin un selector combinado de coberturas en este mismo diálogo.
 */
export class AddRiskDto {
  @IsString()
  ideContractFile!: string;

  @IsString()
  idePlanProductRisk!: string;

  @IsOptional()
  @IsString()
  desFileRisk?: string;

  @IsString()
  ideProductEndorsement!: string;

  @IsDateString()
  tstSupplement!: string;

  @IsString()
  desSupplement!: string;

  /**
   * Valores de atributos personalizables del riesgo elegido, mismo
   * shape/criterio que `CreateQuoteRiskDto.riskAttributeValue` en la
   * cotización (`{ "<IdeAttributeProperty>": "<valor o IdeFieldValue>" }`).
   * Agregado 2026-09-29 tras reporte del usuario: el diálogo "Agregar
   * riesgo" ahora pide estos valores cuando el riesgo elegido tiene
   * atributos configurados (`RiskAttributesService.getSchema`), igual
   * que en Etapa 1 de cotización. No se valida acá contra la definición
   * de atributos -- mismo criterio que `CreateQuoteRiskDto`, queda para
   * una fase posterior de validación de formulario dinámico en el
   * backend.
   */
  @IsOptional()
  @IsObject()
  riskAttributeValue?: Record<string, unknown>;
}
