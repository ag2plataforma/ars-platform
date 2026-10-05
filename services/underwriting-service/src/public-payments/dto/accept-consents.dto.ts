import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

/** Cuerpo de `POST public/payments/links/:token/consents`: ids de `SConsent` que el tomador acepta. */
export class AcceptConsentsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  ideConsents!: string[];
}
