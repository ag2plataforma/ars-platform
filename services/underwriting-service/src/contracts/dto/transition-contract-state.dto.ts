import { IsString } from 'class-validator';

/**
 * Equivalente al `pDesOperativeCode` de `FContract('SETSTATE', ...)` --
 * mismo criterio que `TransitionQuoteStateDto` (ver `quoting/dto`): se
 * expone tal cual, sin traducirlo a un endpoint fijo tipo "anular".
 */
export class TransitionContractStateDto {
  @IsString()
  codOperative!: string;
}
