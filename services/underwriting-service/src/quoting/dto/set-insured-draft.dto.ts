import { IsObject } from 'class-validator';

/** Borrador de los datos de la persona asegurada de un riesgo (lo mismo que se enviara al contratar). */
export class SetInsuredDraftDto {
  @IsObject()
  data!: Record<string, unknown>;
}
