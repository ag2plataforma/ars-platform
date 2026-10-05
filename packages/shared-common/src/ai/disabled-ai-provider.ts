import { ServiceUnavailableException } from '@nestjs/common';
import { AiDocumentExtraction, AiProvider } from './ai-provider.interface';

/** Se usa cuando la IA está apagada (`AI_ENABLED=false`) o sin configurar: falla con un mensaje claro. */
export class DisabledAiProvider implements AiProvider {
  readonly codProvider = 'none';
  readonly enabled = false;
  readonly model = 'none';

  constructor(private readonly reason: string) {}

  async extractDocumentData(): Promise<AiDocumentExtraction> {
    throw new ServiceUnavailableException(`La IA no está disponible: ${this.reason}`);
  }
}
