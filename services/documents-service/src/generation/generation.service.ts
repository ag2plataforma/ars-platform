import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
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
 * Recibo/Cotización/Comunicado (los otros `codTemplateType`) quedan
 * para cuando se aborden sus propios disparadores -- mismo patrón:
 * resolver variables -> `TemplatesService.resolveForGeneration` ->
 * render -> PDF.
 */
@Injectable()
export class GenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
    private readonly templates: TemplatesService,
  ) {}

  async generateContractDocument(ideContract: string, codTemplateType: string, idePersonRol: string, actor: string) {
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
    };

    const docxBytes = renderDocxTemplate(template.TemplateFile as Buffer, variables);
    const pdfBytes = await convertDocxToPdf(docxBytes);

    const ideActivo = await this.stateMachine.getStateByCode('Activo');
    const now = new Date();
    const desFileName = `${template.CodTemplateType}_${contract.NumContract}.pdf`;
    const saved = await this.prisma.tContractOperationDocument.create({
      data: {
        IdeContractOperation: contractOperation.IdeContractOperation,
        DocumentData: {
          codTemplateType: template.CodTemplateType,
          idePersonRol,
          ideOperationProductTemplate: template.IdeOperationProductTemplate,
          generatedBy: actor,
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
   *  (ver `contract-detail.component.ts` en el frontend, que resuelve lo
   *  mismo contra el schema completo del motor de atributos para mostrar
   *  también las opciones de los desplegables con su etiqueta legible).
   *  Acá se resuelve solo el NOMBRE del campo (`SAttributeProperty.
   *  DesAttributeProperty`) contra el valor crudo tal cual está guardado
   *  -- alcanza para el texto libre/números/fechas simples de la ficha
   *  de mascota. Pendiente, fuera de alcance de esta primera versión:
   *  resolver además la ETIQUETA de una opción de lista (requiere leer
   *  `AttributeContent` igual que el resolver del motor de reglas) --
   *  si un atributo es de tipo lista, hoy se muestra el valor crudo
   *  guardado (normalmente ya es el texto, no un id, salvo en catálogos
   *  dinámicos). */
  private async formatRiskAttributes(riskAttributeValue: Record<string, unknown> | null): Promise<string> {
    if (!riskAttributeValue || Object.keys(riskAttributeValue).length === 0) {
      return '';
    }
    const properties = await this.prisma.sAttributeProperty.findMany({
      where: { IdeAttributeProperty: { in: Object.keys(riskAttributeValue) } },
    });
    const labelById = new Map(properties.map((p) => [p.IdeAttributeProperty, p.DesAttributeProperty]));
    return Object.entries(riskAttributeValue)
      .map(([ideAttributeProperty, value]) => `${labelById.get(ideAttributeProperty) ?? ideAttributeProperty}: ${value}`)
      .join(', ');
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
