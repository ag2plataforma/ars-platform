import { AiDocumentExtraction, AiDocumentExtractionInput, AiProvider } from './ai-provider.interface';

/** Proveedor simulado (`AI_PROVIDER=mock`): permite probar el flujo completo sin clave ni coste. */
export class MockAiProvider implements AiProvider {
  readonly codProvider = 'mock';
  readonly enabled = true;
  readonly model = 'mock';

  async extractDocumentData(input: AiDocumentExtractionInput): Promise<AiDocumentExtraction> {
    return {
      documentType: input.requirementName,
      fields: [
        { key: 'nombre', label: 'Nombre (simulado)', value: 'Persona de Prueba', confidence: 'ALTA' },
        { key: 'numDocumento', label: 'Número de documento (simulado)', value: '12345678Z', confidence: 'MEDIA' },
        { key: 'fecha', label: 'Fecha (simulada)', value: new Date().toISOString().slice(0, 10), confidence: 'BAJA' },
      ],
      notes: `Datos simulados del archivo "${input.fileName}": no proceden de ninguna IA real.`,
      model: this.model,
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}
