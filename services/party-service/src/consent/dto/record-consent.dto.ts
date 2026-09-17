import { IsUUID } from 'class-validator';

export class RecordConsentDto {
  @IsUUID()
  ideConsent!: string;

  @IsUUID()
  ideQuote!: string;
}
