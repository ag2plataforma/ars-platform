import { createHash } from 'crypto';
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@ars-platform/database';
import { AI_PROVIDER, AiDocumentExtraction, AiProvider } from '@ars-platform/shared-common';
import { ConfirmExtractionDto } from './dto/confirm-extraction.dto';

export type RequirementKind = 'QUOTE' | 'CONTRACT';

export interface ExtractionProposal {
  idAiRequest: string;
  documentType: string | null;
  fields: AiDocumentExtraction['fields'];
  notes: string | null;
  model: string;
}

/** Lo que se guarda en `Data.extraction` una vez que el operador confirma. */
export interface StoredExtraction {
  fields: Array<{ key: string; label: string; value: string }>;
  documentType: string | null;
  source: 'AI';
  model: string | null;
  idAiRequest: string | null;
  usrConfirmed: string;
  tstConfirmed: string;
}

interface RequirementFile {
  bytes: Buffer;
  fileName: string;
  ideProductRequirement: string;
  indApplyOcr: boolean;
  requirementName: string;
  data: Record<string, unknown> | null;
}

/**
 * Extracción de datos de los documentos de requisitos con IA (Fase 4). Flujo:
 * el operador pulsa "Extraer datos con IA" en un requisito con archivo y con
 * `IndApplyOCR`; la IA PROPONE una lista campo/valor (no se guarda nada); el
 * operador la revisa/corrige y la CONFIRMA, y recién entonces se guarda en
 * `Data.extraction`. Subir otro archivo reemplaza `Data` y borra la extracción
 * anterior a propósito (ya no corresponde al documento).
 *
 * Privacidad: se envía solo el archivo del requisito y la pista; cada llamada
 * queda en `TAiRequest` (quién, qué archivo -- nombre/tamaño/huella, no el
 * contenido --, modelo, tokens). Se inserta ANTES de llamar a la IA: si no se
 * puede dejar la traza, no se envía nada.
 */
@Injectable()
export class RequirementExtractionService {
  private readonly logger = new Logger(RequirementExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
  ) {}

  async extract(kind: RequirementKind, id: string, actor: string): Promise<ExtractionProposal> {
    const file = await this.loadFile(kind, id);
    if (!file.indApplyOcr) {
      throw new ConflictException('Este requisito no tiene activada la extracción con IA (“Aplicar OCR” en la configuración del producto)');
    }
    if (!this.ai.enabled) {
      // Mismo mensaje claro que da el proveedor desactivado, sin dejar traza de algo que no se envió.
      await this.ai.extractDocumentData({ fileName: file.fileName, bytes: file.bytes, requirementName: file.requirementName });
    }
    const hint = await this.loadHint(file.ideProductRequirement);
    const entity = kind === 'CONTRACT' ? 'CONTRACT_REQUIREMENT' : 'QUOTE_REQUIREMENT';
    const idAiRequest = await this.openTrace(entity, id, file, actor);

    try {
      const result = await this.ai.extractDocumentData({
        fileName: file.fileName,
        bytes: file.bytes,
        requirementName: file.requirementName,
        hint,
      });
      await this.closeTrace(idAiRequest, 'OK', actor, {
        numFields: result.fields.length,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        model: result.model,
      });
      return {
        idAiRequest,
        documentType: result.documentType,
        fields: result.fields,
        notes: result.notes,
        model: result.model,
      };
    } catch (err) {
      await this.closeTrace(idAiRequest, 'ERROR', actor, { error: (err as Error).message });
      throw err;
    }
  }

  async confirm(kind: RequirementKind, id: string, dto: ConfirmExtractionDto, actor: string) {
    const file = await this.loadFile(kind, id, false);
    const data: Record<string, unknown> = { ...(file.data ?? {}) };
    if (dto.fields.length === 0) {
      delete data['extraction'];
    } else {
      const stored: StoredExtraction = {
        fields: dto.fields.map((f) => ({ key: f.key, label: f.label.trim(), value: f.value.trim() })).filter((f) => f.value),
        documentType: dto.documentType?.trim() || null,
        source: 'AI',
        model: this.ai.codProvider === 'none' ? null : this.ai.model,
        idAiRequest: dto.idAiRequest ?? null,
        usrConfirmed: actor,
        tstConfirmed: new Date().toISOString(),
      };
      data['extraction'] = stored;
    }
    const now = new Date();
    const update = { Data: data as unknown as Prisma.InputJsonValue, UsrModification: actor, TstModification: now };
    if (kind === 'CONTRACT') {
      await this.prisma.tContractRequirement.update({ where: { IdeContractRequirement: id }, data: update });
    } else {
      await this.prisma.tQuoteRequirement.update({ where: { IdeQuoteRequirement: id }, data: update });
    }
    return { extraction: (data['extraction'] as StoredExtraction | undefined) ?? null };
  }

  // ---------------------------------------------------------------------

  private async loadFile(kind: RequirementKind, id: string, requireFile = true): Promise<RequirementFile> {
    const select = {
      FileData: true,
      DesFileName: true,
      Data: true,
      IdeProductRequirement: true,
      SProductRequirement: { select: { IndApplyOCR: true, DesShort: true, SRequirement: { select: { DesRequirement: true } } } },
    } as const;
    const row =
      kind === 'CONTRACT'
        ? await this.prisma.tContractRequirement.findUnique({ where: { IdeContractRequirement: id }, select })
        : await this.prisma.tQuoteRequirement.findUnique({ where: { IdeQuoteRequirement: id }, select });
    if (!row) throw new NotFoundException(`No existe el requisito "${id}"`);
    if (requireFile && !row.FileData) throw new ConflictException('El requisito todavía no tiene archivo cargado');
    return {
      bytes: row.FileData ? Buffer.from(row.FileData) : Buffer.alloc(0),
      fileName: row.DesFileName ?? 'documento',
      ideProductRequirement: row.IdeProductRequirement,
      indApplyOcr: row.SProductRequirement.IndApplyOCR,
      requirementName: row.SProductRequirement.DesShort || row.SProductRequirement.SRequirement.DesRequirement,
      data: row.Data && typeof row.Data === 'object' && !Array.isArray(row.Data) ? (row.Data as Record<string, unknown>) : null,
    };
  }

  private async loadHint(ideProductRequirement: string): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<Array<{ DesExtractionHint: string | null }>>`
      SELECT "DesExtractionHint" FROM ars_platform."SProductRequirement"
       WHERE "IdeProductRequirement" = ${ideProductRequirement}::uuid`;
    return rows[0]?.DesExtractionHint ?? null;
  }

  private async openTrace(entity: string, ideEntity: string, file: RequirementFile, actor: string): Promise<string> {
    const now = new Date();
    const hash = createHash('sha256').update(file.bytes).digest('hex');
    const rows = await this.prisma.$queryRaw<Array<{ IdeAiRequest: string }>>`
      INSERT INTO ars_platform."TAiRequest"
        ("CodTask", "CodEntity", "IdeEntity", "CodProvider", "DesModel", "DesFileName", "NumFileBytes", "DesFileHash",
         "CodStatus", "UsrCreation", "TstCreation", "UsrModification", "TstModification")
      VALUES
        ('DOC_EXTRACT', ${entity}, ${ideEntity}::uuid, ${this.ai.codProvider}, ${this.ai.model}, ${file.fileName},
         ${file.bytes.length}, ${hash}, 'PENDIENTE', ${actor}, ${now}, ${actor}, ${now})
      RETURNING "IdeAiRequest"`;
    return rows[0].IdeAiRequest;
  }

  private async closeTrace(
    idAiRequest: string,
    status: 'OK' | 'ERROR',
    actor: string,
    info: { numFields?: number; inputTokens?: number | null; outputTokens?: number | null; model?: string; error?: string },
  ): Promise<void> {
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
