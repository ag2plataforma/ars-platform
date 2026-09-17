import { IsString } from 'class-validator';

/**
 * Equivalente al `pDesOperativeCode` de `FQuote_SetState` -- el código
 * operativo real (qué transiciones existen, ver `SStateRule`) todavía no
 * se investigó, se expone tal cual sin traducirlo a un endpoint fijo
 * (ver el comentario de `QuotesService.transitionState`).
 */
export class TransitionQuoteStateDto {
  @IsString()
  codOperative!: string;
}
