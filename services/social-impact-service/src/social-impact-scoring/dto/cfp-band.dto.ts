import { IsNumber, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class CfpBandDto {
  /** Omitido en el JSON de entrada = sin límite superior (el tramo
   *  "catch-all") -- se normaliza a `null` acá mismo (vía `@Transform`)
   *  para que el tipo en runtime coincida siempre con `CfpBand.maxKgCo2`
   *  (`number | null`, sin `undefined`), evitando divergencia entre el
   *  shape validado por `class-validator` y la interfaz de dominio. */
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => (value === undefined ? null : value))
  maxKgCo2!: number | null;

  @IsNumber()
  points!: number;
}
