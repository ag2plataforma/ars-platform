import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@ars-platform/database';
import { EMAIL_SENDER, EmailSender, StateMachineService } from '@ars-platform/shared-common';
import { TemplatesService } from '../templates/templates.service';
import { renderDocxTemplate } from '../rendering/render-template';
import { convertDocxToPdf } from '../rendering/docx-to-pdf';

function formatDate(date: Date | null | undefined): string {
  if (!date) return '';
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getFullYear()}`;
}

function formatMoney(value: Prisma.Decimal | number | null | undefined): string {
  if (value === null || value === undefined) return '0,00';
  return Number(value).toFixed(2).replace('.', ',');
}

/** Forma que arma `buildPersonVariables` -- nombres de campo en
 *  camelCase porque así los pide la plantilla Word real (heredada del
 *  `ag2-printer-api` viejo), ej. `{{tomador.desFirstName}}`. */
interface PersonVariables {
  desFirstName: string;
  desLastName1: string;
  desAddress: string;
  codPostal: string;
  numIdentification: string;
  desContactData: string;
  desEmail: string;
  tstBirthday: string;
}

/**
 * Primer tipo de documento implementado de punta a punta (alcance
 * acordado con el usuario, 2026-10-01): "Póliza/Contrato emitido".
 *
 * Variables resueltas acá -- el set completo que pide la plantilla real
 * subida por el usuario ("Condiciones Particulares", heredada del
 * `ag2-printer-api` viejo): datos del contrato, Tomador Y Titular por
 * separado (con dirección/contacto/nacimiento), el plan y los atributos
 * de la mascota asegurada, la tabla de recibos de la operación de alta
 * (`{{#receipts}}...{{/receipts}}`) y la tabla de coberturas de su
 * primer riesgo/archivo (`{{#coverages}}...{{/coverages}}`) -- ambas
 * como loops reales de docxtemplater (ver nota de corrección en
 * `render-template.ts`: SÍ son parte del módulo gratuito, no hacía
 * falta aplanar esto en texto como en la primera versión).
 *
 * Los otros tres tipos (acordados con el usuario, 2026-10-03, "a
 * demanda por ahora": ningún disparador automático):
 * - RECIBO: un PDF por recibo, elegido de los recibos del contrato; suma
 *   `{{recibo.*}}` a las variables del contrato y se guarda colgado de
 *   la operación a la que pertenece ese recibo.
 * - COMUNICADO: las mismas variables del contrato + `{{mensaje}}`, texto
 *   libre que escribe el operador al generar.
 * - COTIZACION: se genera al vuelo desde una cotización (sin guardar nada,
 *   sin tabla nueva) -- ver `generateQuotePdf`.
 * Las plantillas de los cuatro tipos se cargan bajo la operación "Alta de
 * póliza" (CONTGENE) del producto.
 */
@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
    private readonly templates: TemplatesService,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
  ) {}

  async generateContractDocument(
    ideContract: string,
    codTemplateType: string,
    idePersonRol: string,
    actor: string,
    extras: { ideReceipt?: string; mensaje?: string } = {},
  ) {
    if (codTemplateType === 'COTIZACION') {
      throw new BadRequestException(
        'La cotización se genera desde la cotización (no desde un contrato) -- usá "Descargar cotización en PDF"',
      );
    }
    if (codTemplateType === 'RECIBO' && !extras.ideReceipt) {
      throw new BadRequestException('Para generar un recibo hay que elegir cuál (ideReceipt)');
    }

    const contract = await this.prisma.tContract.findUnique({
      where: { IdeContract: ideContract },
      include: {
        SProduct: true,
        SValidityType: true,
        SPaymentFraction: true,
        TContractPerson: {
          where: { SPersonRol: { CodPersonRol: { in: ['TOMADOR', 'TITULAR'] } } },
          include: {
            SPersonRol: true,
            TPerson: {
              include: {
                TAddress: { where: { IndMain: true }, take: 1 },
                TContactData: { where: { IndMain: true }, take: 1 },
              },
            },
          },
        },
        TContractFile: {
          include: {
            TFileRisk: {
              include: {
                SRiskProduct: true,
                SPlanProductRisk: { include: { SPlanProduct: true } },
                TRiskCoverage: { include: { SCoveragePlan: true } },
              },
            },
          },
        },
      },
    });
    if (!contract) {
      throw new NotFoundException(`No existe contrato con id "${ideContract}"`);
    }

    // La operación "Alta de póliza" (CONTGENE) del contrato -- es a la
    // que se le cuelga el documento generado (TContractOperationDocument)
    // y de la que se toman sus recibos (`{{#receipts}}`) y su descripción
    // de movimiento (`{{desProcess}}`).
    const contractOperation = await this.prisma.tContractOperation.findFirst({
      where: { IdeContract: ideContract, SOperationProduct: { SOperation: { CodOperation: 'CONTGENE' } } },
      include: { SOperationProduct: { include: { SOperation: true } } },
    });
    if (!contractOperation) {
      throw new ConflictException(
        `El contrato "${contract.NumContract}" no tiene una operación de alta (CONTGENE) -- no se puede generar el documento`,
      );
    }

    const template = await this.templates.resolveForGeneration(
      contractOperation.IdeOperationProduct,
      codTemplateType,
      idePersonRol,
    );

    const tomador = this.buildPersonVariables(
      contract.TContractPerson.find((cp) => cp.SPersonRol.CodPersonRol === 'TOMADOR')?.TPerson,
    );
    const titular = this.buildPersonVariables(
      contract.TContractPerson.find((cp) => cp.SPersonRol.CodPersonRol === 'TITULAR')?.TPerson,
    );

    const primerArchivo = contract.TContractFile[0];
    const primerRiesgo = primerArchivo?.TFileRisk[0];

    const mascotaAtributos = await this.formatRiskAttributes(
      (primerRiesgo?.RiskAttributeValue as Record<string, unknown> | null) ?? null,
    );

    const coverages = (primerRiesgo?.TRiskCoverage ?? []).map((coverage) => ({
      desCoverage: coverage.SCoveragePlan.DesShort ?? 'Cobertura',
      tstInitial: formatDate(coverage.TstInitial),
      tstEnd: formatDate(coverage.TstEnd),
      amount: formatMoney(coverage.Amount),
      rate: formatMoney(coverage.Rate),
      prime: formatMoney(coverage.Prime),
    }));

    // Los recibos NO cuelgan de la operación de alta (CONTGENE) -- el
    // backend real de contratos siempre genera una operación RECEGENE
    // aparte para esto (`ContractsService.generateReceipts`, "SIEMPRE
    // nueva"), normalmente la inmediata siguiente a la de alta
    // (NumOperation=2 cuando CONTGENE=1). Se toma la primera RECEGENE del
    // contrato (`orderBy NumOperation asc`) -- es la que corresponde a
    // esta emisión inicial; una renovación/suplemento posterior generaría
    // una RECEGENE propia que no es la de este documento.
    const receiptOperation = await this.prisma.tContractOperation.findFirst({
      where: { IdeContract: ideContract, SOperationProduct: { SOperation: { CodOperation: 'RECEGENE' } } },
      orderBy: { NumOperation: 'asc' },
    });
    const receiptRows = receiptOperation
      ? await this.prisma.tReceipt.findMany({
          where: { IdeContractOperation: receiptOperation.IdeContractOperation },
          orderBy: { TstInitial: 'asc' },
        })
      : [];
    const receipts = receiptRows.map((receipt) => ({
      tstInitial: formatDate(receipt.TstInitial),
      tstEnd: formatDate(receipt.TstEnd),
      prime: formatMoney(receipt.Prime),
    }));

    let selectedReceipt: (typeof receiptRows)[number] | null = null;
    let receiptTypeLabel = '';
    if (codTemplateType === 'RECIBO') {
      const row = await this.prisma.tReceipt.findFirst({
        where: { IdeReceipt: extras.ideReceipt, IdeContract: ideContract },
        include: { SReceiptType: true, SState: true },
      });
      if (!row) {
        throw new NotFoundException(`El contrato "${contract.NumContract}" no tiene el recibo "${extras.ideReceipt}"`);
      }
      selectedReceipt = row;
      receiptTypeLabel = row.SReceiptType.DesReceiptType;
    }

    const variables = {
      desProduct: contract.SProduct.DesProduct,
      numContract: contract.NumContract,
      desRiskProduct: primerRiesgo?.SRiskProduct.DesShort ?? '',
      desPlanProduct: primerRiesgo?.SPlanProductRisk.SPlanProduct.DesPlanProduct ?? '',
      desValidityType: contract.SValidityType.DesValidityType,
      tstInitial: formatDate(contract.TstInitial),
      tstEnd: formatDate(contract.TstEnd),
      desProcess: contractOperation.SOperationProduct.SOperation.DesOperation,
      desPaymentFraction: contract.SPaymentFraction.DesPaymentFraction,
      tstSubscription: formatDate(contract.TstSubscription),
      tomador,
      titular,
      mascotaAtributos,
      receipts,
      primaAnualizada: receipts[0]?.prime ?? '0,00',
      coverages,
      mensaje: extras.mensaje ?? '',
      tstToday: formatDate(new Date()),
      recibo: selectedReceipt
        ? {
            numReceipt: selectedReceipt.NumReceipt,
            desReceiptType: receiptTypeLabel,
            tstIssue: formatDate(selectedReceipt.TstIssue),
            tstInitial: formatDate(selectedReceipt.TstInitial),
            tstEnd: formatDate(selectedReceipt.TstEnd),
            tstDueDate: formatDate(selectedReceipt.TstDueDate),
            prime: formatMoney(selectedReceipt.Prime),
            fee: formatMoney(selectedReceipt.Fee),
            total: formatMoney(Number(selectedReceipt.Prime) + Number(selectedReceipt.Fee)),
          }
        : null,
    };

    const docxBytes = renderDocxTemplate(template.TemplateFile as Buffer, variables);
    const pdfBytes = await convertDocxToPdf(docxBytes);

    const ideActivo = await this.stateMachine.getStateByCode('Activo');
    const now = new Date();
    const desFileName = selectedReceipt
      ? `RECIBO_${selectedReceipt.NumReceipt.replace(/[^A-Za-z0-9_-]/g, '')}.pdf`
      : `${template.CodTemplateType}_${contract.NumContract}.pdf`;
    const saved = await this.prisma.tContractOperationDocument.create({
      data: {
        // El recibo se guarda colgado de la operación a la que pertenece
        // ese recibo (normalmente la RECEGENE); los demás, de la de alta.
        IdeContractOperation: selectedReceipt?.IdeContractOperation ?? contractOperation.IdeContractOperation,
        DocumentData: {
          codTemplateType: template.CodTemplateType,
          idePersonRol,
          ideOperationProductTemplate: template.IdeOperationProductTemplate,
          generatedBy: actor,
          ...(selectedReceipt ? { ideReceipt: selectedReceipt.IdeReceipt, numReceipt: selectedReceipt.NumReceipt } : {}),
          ...(codTemplateType === 'COMUNICADO' && extras.mensaje ? { mensaje: extras.mensaje } : {}),
        },
        PdfData: pdfBytes,
        DesFileName: desFileName,
        TstRequest: now,
        IdeState: ideActivo,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
    });

    return { ideContractOperationDocument: saved.IdeContractOperationDocument, desFileName };
  }

  /** Recibos del contrato, para el selector del diálogo "Generar
   *  documento" cuando el tipo es RECIBO (un PDF por recibo). */
  async listReceipts(ideContract: string) {
    const rows = await this.prisma.tReceipt.findMany({
      where: { IdeContract: ideContract },
      include: { SState: { select: { DesState: true } } },
      orderBy: { TstInitial: 'asc' },
    });
    return rows.map((r) => ({
      ideReceipt: r.IdeReceipt,
      numReceipt: r.NumReceipt,
      tstInitial: r.TstInitial,
      tstEnd: r.TstEnd,
      prime: Number(r.Prime),
      desState: r.SState.DesState,
    }));
  }

  /**
   * COTIZACION al vuelo -- decisión del usuario (2026-10-03): se genera
   * desde la cotización cuando se pide y NO se persiste nada (sin tabla
   * nueva: no existe un equivalente a `TContractOperationDocument` para
   * cotizaciones). La plantilla se carga bajo la operación "Alta de
   * póliza" (CONTGENE) del producto de la cotización, tipo COTIZACION.
   *
   * Variables: `numQuote`, `tstQuote`, `desProduct`, `tomador`/`titular`
   * (de `TQuotePerson`; si la cotización no tiene Tomador cargado se usa
   * la persona de `TQuote.IdePerson`), el primer riesgo
   * (`desRiskProduct`, `mascotaAtributos`), el plan elegido
   * (`desPlanProduct`, `coverages[]` con las coberturas seleccionadas,
   * `primaTotal`) y `planes[]` (todos los planes cotizados del primer
   * riesgo con su prima, por si la plantilla quiere compararlos).
   */
  async generateQuotePdf(ideQuote: string, idePersonRol: string) {
    const quote = await this.prisma.tQuote.findUnique({
      where: { IdeQuote: ideQuote },
      include: {
        SProduct: true,
        TPerson: { include: { TAddress: { where: { IndMain: true }, take: 1 }, TContactData: { where: { IndMain: true }, take: 1 } } },
        TQuotePerson: {
          where: { SPersonRol: { CodPersonRol: { in: ['TOMADOR', 'TITULAR'] } } },
          include: {
            SPersonRol: true,
            TPerson: { include: { TAddress: { where: { IndMain: true }, take: 1 }, TContactData: { where: { IndMain: true }, take: 1 } } },
          },
        },
        TQuoteRisk: {
          orderBy: { NumRisk: 'asc' },
          include: {
            SRiskProduct: true,
            TQuoteRiskPlan: {
              include: {
                SPlanProductRisk: { include: { SPlanProduct: true } },
                TQuoteCoverage: { include: { SCoveragePlan: true } },
              },
            },
          },
        },
      },
    });
    if (!quote) {
      throw new NotFoundException(`No existe cotización con id "${ideQuote}"`);
    }

    const operationProducts = await this.prisma.sOperationProduct.findMany({
      where: { IdeProduct: quote.IdeProduct, SOperation: { CodOperation: 'CONTGENE' } },
      select: { IdeOperationProduct: true },
    });
    if (operationProducts.length === 0) {
      throw new ConflictException(
        'El producto de la cotización no tiene la operación "Alta de póliza" (CONTGENE) -- ahí se cargan las plantillas de cotización',
      );
    }
    const template = await this.templates.resolveForGeneration(
      operationProducts.map((op) => op.IdeOperationProduct),
      'COTIZACION',
      idePersonRol,
    );

    const personOf = (cod: string) => quote.TQuotePerson.find((qp) => qp.SPersonRol.CodPersonRol === cod)?.TPerson;
    const tomador = this.buildPersonVariables(personOf('TOMADOR') ?? quote.TPerson ?? undefined);
    const titular = this.buildPersonVariables(personOf('TITULAR'));

    const primerRiesgo = quote.TQuoteRisk[0];
    const planes = (primerRiesgo?.TQuoteRiskPlan ?? []).map((plan) => {
      const coverages = plan.TQuoteCoverage.filter((c) => c.IndSelected).map((c) => ({
        desCoverage: c.SCoveragePlan.DesShort ?? 'Cobertura',
        amount: formatMoney(c.Amount),
        rate: formatMoney(c.Rate),
        prime: formatMoney(c.Prime),
      }));
      const primaTotal = plan.TQuoteCoverage.filter((c) => c.IndSelected).reduce(
        (sum, c) => sum + Number(c.Prime),
        0,
      );
      return {
        desPlanProduct: plan.SPlanProductRisk.SPlanProduct.DesPlanProduct,
        indSelected: plan.IndSelected,
        coverages,
        primaTotal: formatMoney(primaTotal),
      };
    });
    const planElegido = planes.find((p) => p.indSelected) ?? planes[0];

    const mascotaAtributos = await this.formatRiskAttributes(
      (primerRiesgo?.RiskAttributeValue as Record<string, unknown> | null) ?? null,
    );

    const variables = {
      numQuote: quote.NumQuote,
      tstQuote: formatDate(quote.TstQuote),
      desProduct: quote.SProduct.DesProduct,
      desRiskProduct: primerRiesgo?.SRiskProduct.DesShort ?? '',
      desPlanProduct: planElegido?.desPlanProduct ?? '',
      tomador,
      titular,
      mascotaAtributos,
      coverages: planElegido?.coverages ?? [],
      primaTotal: planElegido?.primaTotal ?? '0,00',
      planes,
      mensaje: '',
      tstToday: formatDate(new Date()),
    };

    const docxBytes = renderDocxTemplate(template.TemplateFile as Buffer, variables);
    const pdfBytes = await convertDocxToPdf(docxBytes);
    return { bytes: pdfBytes, desFileName: `COTIZACION_${quote.NumQuote.replace(/[^A-Za-z0-9_-]/g, '')}.pdf` };
  }

  /** Arma el sub-objeto `tomador`/`titular` que pide la plantilla
   *  (`{{tomador.desFirstName}}`, etc.) -- nombre completo se deja como
   *  `desFirstName`/`desLastName1` por separado porque así están los
   *  tags reales en el Word, no hace falta concatenarlos acá.
   *  Dirección principal (`TAddress.IndMain`) y contacto principal
   *  (`TContactData.IndMain`) -- mismo criterio "primero activo/principal"
   *  que usa el resto del backend; si la persona no tiene uno cargado,
   *  queda vacío (mismo criterio de `nullGetter` del motor de plantillas:
   *  dato no configurado no rompe el documento). */
  private buildPersonVariables(
    person:
      | {
          DesFirstName: string;
          DesLastName1: string | null;
          NumIdentification: string | null;
          DesEmail: string;
          TstBirthdate: Date | null;
          TAddress: { DesAddressLine1: string; CodPostal: string }[];
          TContactData: { DesContactData: string }[];
        }
      | undefined,
  ): PersonVariables {
    if (!person) {
      return {
        desFirstName: '',
        desLastName1: '',
        desAddress: '',
        codPostal: '',
        numIdentification: '',
        desContactData: '',
        desEmail: '',
        tstBirthday: '',
      };
    }
    return {
      desFirstName: person.DesFirstName,
      desLastName1: person.DesLastName1 ?? '',
      desAddress: person.TAddress[0]?.DesAddressLine1 ?? '',
      codPostal: person.TAddress[0]?.CodPostal ?? '',
      numIdentification: person.NumIdentification ?? '',
      desContactData: person.TContactData[0]?.DesContactData ?? '',
      desEmail: person.DesEmail,
      tstBirthday: formatDate(person.TstBirthdate),
    };
  }

  /** `TFileRisk.RiskAttributeValue` es `{ IdeAttributeProperty: valor }`
   *  (ver `ModelAttributesService.getSchema` en reference-data-service,
   *  que arma el mismo schema para el frontend). Por cada atributo se
   *  resuelve el NOMBRE del campo (el `label` del JSON `AttributeContent`
   *  si lo trae, si no `DesAttributeProperty`) y, para los de tipo lista,
   *  la ETIQUETA legible de la opción elegida en vez del id guardado:
   *  primero contra los valores vivos del diccionario de campo
   *  (`SFieldValue.IdeFieldValue` -> `DesFieldValue`, sin filtrar por
   *  estado para que una opción desactivada después siga resolviendo en
   *  contratos viejos) y, si el atributo no tiene diccionario, contra
   *  `options` embebidas en `AttributeContent` (`{key: etiqueta, value}`).
   *  Un valor sin opción que coincida (texto libre, número, fecha) se
   *  muestra tal cual. */
  private async formatRiskAttributes(riskAttributeValue: Record<string, unknown> | null): Promise<string> {
    if (!riskAttributeValue || Object.keys(riskAttributeValue).length === 0) {
      return '';
    }
    const properties = await this.prisma.sAttributeProperty.findMany({
      where: { IdeAttributeProperty: { in: Object.keys(riskAttributeValue) } },
      include: { SAttribute: { include: { SFieldDictionary: { include: { SFieldValue: true } } } } },
    });
    const byId = new Map(properties.map((p) => [p.IdeAttributeProperty, p]));
    return Object.entries(riskAttributeValue)
      .map(([ideAttributeProperty, value]) => {
        const property = byId.get(ideAttributeProperty);
        const label = property ? this.resolveAttributeLabel(property) : ideAttributeProperty;
        const shown = property ? this.resolveAttributeValue(property, value) : String(value);
        return `${label}: ${shown}`;
      })
      .join(', ');
  }

  private parseAttributeContent(attributeContent: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(attributeContent);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  private resolveAttributeLabel(property: { DesAttributeProperty: string; AttributeContent: string }): string {
    const content = this.parseAttributeContent(property.AttributeContent);
    return typeof content.label === 'string' && content.label ? content.label : property.DesAttributeProperty;
  }

  private resolveAttributeValue(
    property: {
      AttributeContent: string;
      SAttribute: { SFieldDictionary: { SFieldValue: { IdeFieldValue: string; DesFieldValue: string }[] } | null };
    },
    value: unknown,
  ): string {
    if (value === null || value === undefined || value === '') return '';
    const raw = String(value);
    const liveValue = property.SAttribute.SFieldDictionary?.SFieldValue.find((v) => v.IdeFieldValue === raw);
    if (liveValue) return liveValue.DesFieldValue;
    const content = this.parseAttributeContent(property.AttributeContent);
    if (Array.isArray(content.options)) {
      const option = (content.options as Array<{ key: string; value: unknown }>).find(
        (o) => String(o.value) === raw,
      );
      if (option) return option.key;
    }
    return raw;
  }

  /**
   * Correo de bienvenida con la póliza en PDF adjunta -- disparado por
   * `underwriting-service` justo después de "Activar contrato"
   * (`ContractsService.activate`, ver `DocumentsHttpClient` ahí), vía
   * llamada HTTP real entre servicios (mismo patrón ya establecido con
   * `social-impact-service`: `fetch` nativo, reenvía el `Authorization`
   * del usuario, sin credencial service-to-service aparte).
   *
   * Reusa `generateContractDocument` tal cual (mismo documento
   * "Póliza/Contrato emitido" que ya se puede generar a mano desde la
   * pestaña Documentos) -- el rol destinatario es SIEMPRE el Titular acá
   * (es quien recibe el correo), resuelto por código (`SPersonRol.
   * CodPersonRol==='TITULAR'`) en vez de pedirlo como parámetro.
   *
   * Deliberadamente NO lanza si algo falla (plantilla todavía no
   * configurada para este producto, LibreOffice no disponible, Brevo mal
   * configurado, Titular sin email) -- "Activar contrato" no debe
   * quedar bloqueado por un correo de cortesía. Se loguea el motivo y
   * `DocumentsHttpClient` del otro lado también ignora el resultado,
   * mismo criterio de "degradación elegante" ya usado en
   * `EmissionsDevClient`.
   */
  async generateWelcomeEmail(ideContract: string, actor: string): Promise<{ sent: boolean; reason?: string }> {
    try {
      const titularRole = await this.prisma.sPersonRol.findFirst({ where: { CodPersonRol: 'TITULAR' } });
      if (!titularRole) {
        return { sent: false, reason: 'No existe el rol TITULAR en SPersonRol' };
      }

      const titularPerson = await this.prisma.tContractPerson.findFirst({
        where: { IdeContract: ideContract, SPersonRol: { CodPersonRol: 'TITULAR' } },
        include: { TPerson: true },
      });
      if (!titularPerson?.TPerson.DesEmail) {
        return { sent: false, reason: 'El contrato no tiene Titular con email resuelto' };
      }

      const { ideContractOperationDocument } = await this.generateContractDocument(
        ideContract,
        'CONTRATO',
        titularRole.IdePersonRol,
        actor,
      );
      const { bytes, desFileName } = await this.getFile(ideContractOperationDocument);
      const contract = await this.prisma.tContract.findUniqueOrThrow({
        where: { IdeContract: ideContract },
        select: { NumContract: true },
      });

      const desTitular = [titularPerson.TPerson.DesFirstName, titularPerson.TPerson.DesLastName1]
        .filter(Boolean)
        .join(' ');

      await this.emailSender.send({
        to: titularPerson.TPerson.DesEmail,
        subject: `¡Bienvenido a ARS! Tu póliza ${contract.NumContract} ya está activa`,
        html: `
          <p>Hola ${desTitular || 'cliente'},</p>
          <p>Tu póliza <strong>${contract.NumContract}</strong> ya está activa. Te adjuntamos el documento con las condiciones particulares.</p>
          <p>¡Gracias por confiar en nosotros!</p>
        `,
        attachments: [{ name: desFileName, contentBase64: bytes.toString('base64') }],
      });

      return { sent: true };
    } catch (err) {
      const reason = (err as Error).message;
      this.logger.error(`No se pudo enviar el correo de bienvenida del contrato "${ideContract}": ${reason}`);
      return { sent: false, reason };
    }
  }

  async listForContract(ideContract: string) {
    const rows = await this.prisma.tContractOperationDocument.findMany({
      where: { TContractOperation: { IdeContract: ideContract } },
      orderBy: { TstRequest: 'desc' },
    });
    return rows.map((row) => ({
      ideContractOperationDocument: row.IdeContractOperationDocument,
      desFileName: row.DesFileName,
      tstRequest: row.TstRequest,
      documentData: row.DocumentData,
      hasFile: row.PdfData !== null,
    }));
  }

  async getFile(ideContractOperationDocument: string) {
    const row = await this.prisma.tContractOperationDocument.findUnique({
      where: { IdeContractOperationDocument: ideContractOperationDocument },
    });
    if (!row || !row.PdfData) {
      throw new NotFoundException(`No existe el documento "${ideContractOperationDocument}" o no tiene archivo`);
    }
    return { bytes: row.PdfData as Buffer, desFileName: row.DesFileName ?? 'documento.pdf' };
  }
}
