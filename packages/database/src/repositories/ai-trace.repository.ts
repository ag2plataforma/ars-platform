import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface AiTraceOpenInput {
  /** Tarea de IA: `DOC_EXTRACT`, `CLAIM_TRIAGE`... */
  codTask: string;
  /** Entidad sobre la que se actúa: `CONTRACT_REQUIREMENT`, `CLAIM_FILE`... */
  codEntity: string;
  ideEntity: string;
  codProvider: string;
  model: string;
  /** Nombre del archivo enviado, si lo hay. */
  fileName?: string | null;
  /** Tamaño del contenido enviado a la IA (archivo o texto de la petición). */
  contentBytes: number;
  /** SHA-256 del contenido enviado: permite auditar qué se envió SIN guardarlo. */
  contentHash: string;
  actor: string;
}

export interface AiTraceCloseInfo {
  numFields?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  model?: string;
  error?: string;
}

/**
 * Trazabilidad de TODA llamada a la IA (`TAiRequest`, ver
 * `setup-ai-extraction.js`): quién la pidió, para qué entidad, qué se envió
 * (tamaño y huella, no el contenido), proveedor/modelo, tokens y resultado.
 * La traza se abre ANTES de llamar a la IA: si no se puede dejar constancia,
 * no se envía nada. SQL crudo hasta regenerar Prisma con la tabla.
 */
@Injectable()
export class AiTraceRepository {
  private readonly logger = new Logger(AiTraceRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async open(input: AiTraceOpenInput): Promise<string> {
    const now = new Date();
    const rows = await this.prisma.$queryRaw<Array<{ IdeAiRequest: string }>>`
      INSERT INTO ars_platform."TAiRequest"
        ("CodTask", "CodEntity", "IdeEntity", "CodProvider", "DesModel", "DesFileName", "NumFileBytes", "DesFileHash",
         "CodStatus", "UsrCreation", "TstCreation", "UsrModification", "TstModification")
      VALUES
        (${input.codTask}, ${input.codEntity}, ${input.ideEntity}::uuid, ${input.codProvider}, ${input.model},
         ${input.fileName ?? null}, ${input.contentBytes}, ${input.contentHash}, 'PENDIENTE',
         ${input.actor}, ${now}, ${input.actor}, ${now})
      RETURNING "IdeAiRequest"`;
    return rows[0].IdeAiRequest;
  }

  async close(idAiRequest: string, status: 'OK' | 'ERROR', actor: string, info: AiTraceCloseInfo = {}): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        UPDATE ars_platform."TAiRequest"
           SET "CodStatus" = ${status}, "NumFields" = ${info.numFields ?? null},
               "NumInputTokens" = ${info.inputTokens ?? null}, "NumOutputTokens" = ${info.outputTokens ?? null},
               "DesModel" = COALESCE(${info.model ?? null}, "DesModel"),
               "DesError" = ${info.error ? info.error.slice(0, 500) : null},
               "UsrModification" = ${actor}, "TstModification" = ${new Date()}
         WHERE "IdeAiRequest" = ${idAiRequest}::uuid`;
    } catch (err) {
      this.logger.error(`No se pudo cerrar la traza de IA ${idAiRequest}: ${(err as Error).message}`);
    }
  }
}
