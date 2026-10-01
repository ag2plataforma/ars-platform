import { IsBoolean } from 'class-validator';

/**
 * Body de `PATCH /contracts/:id/renewal-opt-out` (Etapa 2 de "Gestión de
 * renovaciones", ver docs/02-roadmap.md) -- el operador marca/desmarca
 * que ESTE contrato en particular no se renueve automáticamente al
 * vencer (ej. no rentable para la compañía). Solo el flag, sin motivo ni
 * fecha propios en esta primera vuelta (alcance "simple" acordado con el
 * usuario).
 */
export class SetRenewalOptOutDto {
  @IsBoolean()
  noRenovar!: boolean;
}
