import { IsBoolean, IsNumber, IsOptional, IsString, Matches } from 'class-validator';

/**
 * Catálogo genérico de recargos/descuentos (docs/02-roadmap.md, Fase 2
 * backlog ítem 7) -- ver doc-comment de `AdjustmentsService`.
 */
export class CreateAdjustmentDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codAdjustment solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codAdjustment!: string;

  @IsString()
  desAdjustment!: string;

  /** Negativo = descuento, positivo = recargo -- mismo signo que
   *  `AppliedAdjustment.pctPrimaAdjustment` (`adjustment-value.resolver.ts`). */
  @IsNumber()
  pctAdjustment!: number;

  /** Por ahora solo un flag reservado -- ver doc-comment de
   *  `setup-generic-adjustments-tables.js`, ningún ajuste automático se
   *  aplica solo todavía. */
  @IsOptional()
  @IsBoolean()
  indAutomatic?: boolean;
}
