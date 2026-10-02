import { IsArray, IsString } from 'class-validator';

/**
 * Recargos/descuentos genéricos (docs/02-roadmap.md, Fase 2 backlog
 * ítem 7) -- reemplaza el set completo de `SAdjustment` "Manual"
 * aplicados a la cotización. Lista vacía = ninguno aplicado (el
 * operador puede desmarcar todos). Ver doc-comment de
 * `QuotesService.setQuoteAdjustments`.
 */
export class SetQuoteAdjustmentsDto {
  @IsArray()
  @IsString({ each: true })
  ideAdjustments!: string[];
}
