import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreateRiskFieldDto, FIELD_STAGES, RISK_FIELD_TYPES, UpdateRiskFieldDto } from './dto/risk-field.dto';

/** Prefijo de los diccionarios creados desde esta pantalla (el resto, p. ej. razas, son compartidos/solo lectura). */
const OWN_DICTIONARY_PREFIX = 'RF_';

export interface RiskFieldOption {
  ideFieldValue: string;
  desFieldValue: string;
  active: boolean;
}

export interface RiskFieldView {
  ideAttributeProperty: string;
  codAttributeProperty: string;
  label: string;
  type: string;
  required: boolean;
  min: number | null;
  max: number | null;
  maxLength: number | null;
  codFieldDictionary: string;
  desFieldDictionary: string;
  /** `true` si las opciones se editan acá (diccionario creado desde esta pantalla). */
  ownDictionary: boolean;
  options: RiskFieldOption[];
  /** `PRICING` (se pide al cotizar) o `CONTRACT` (solo al contratar). */
  codStage: string;
  codState: string;
}

type Content = {
  name?: string;
  label?: string;
  type?: string;
  validators?: Array<{ validationName: string; aditionalProps?: Record<string, unknown> }>;
  validationMessages?: Record<string, string>;
  options?: unknown;
  [key: string]: unknown;
};

/**
 * Configuración SIMPLIFICADA de los campos personalizados de un tipo de riesgo (`SRiskProduct`).
 * Por debajo usa la cadena real del motor de atributos -- `SModelAttribute` (set del riesgo)
 * -> `SAttributeProperty` (el campo, con el JSON de formulario en `AttributeContent`)
 * -> `SAttribute` (concepto) -> `SFieldDictionary`/`SFieldValue` (opciones) -- pero oculta esa
 * cadena: el usuario solo define etiqueta, tipo, obligatoriedad y opciones. El formulario
 * dinámico lo arma `ModelAttributesService.getSchemaForReference`, que lee estas mismas filas.
 *
 * Los valores se guardan en `RiskAttributeValue` indexados por `IdeAttributeProperty` (para
 * listas, el `IdeFieldValue` elegido). Un campo solo influye en la TARIFA si una tabla de
 * factores lo usa (configuración de tarifas); sin eso es un dato informativo del riesgo.
 */
@Injectable()
export class RiskFieldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  /**
   * Diccionarios de valores reutilizables para campos de tipo lista: activos y con al menos una
   * opción activa. Se excluyen los propios de cada campo (`RF_`), que no tiene sentido compartir.
   */
  async listDictionaries(): Promise<Array<{ codFieldDictionary: string; desFieldDictionary: string; optionCount: number }>> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const dictionaries = await this.prisma.sFieldDictionary.findMany({
      where: { IdeState: activeStateId, NOT: { CodFieldDictionary: { startsWith: OWN_DICTIONARY_PREFIX } } },
      include: { _count: { select: { SFieldValue: { where: { IdeState: activeStateId } } } } },
      orderBy: { DesFieldDictionary: 'asc' },
    });
    return dictionaries
      .map((d) => ({
        codFieldDictionary: d.CodFieldDictionary,
        desFieldDictionary: d.DesFieldDictionary,
        optionCount: d._count.SFieldValue,
      }))
      .filter((d) => d.optionCount > 0);
  }

  /** Campos de un set de atributos por su referencia: `IdeRiskProduct` (campos de riesgo) o `IdeProduct` (campos de producto). */
  async findByReference(ideReference: string): Promise<RiskFieldView[]> {
    const models = await this.prisma.sModelAttribute.findMany({ where: { IdeReference: ideReference } });
    if (models.length === 0) return [];
    const properties = await this.prisma.sAttributeProperty.findMany({
      where: { IdeModelAttribute: { in: models.map((m) => m.IdeModelAttribute) } },
      include: {
        SState: true,
        SAttribute: { include: { SFieldDictionary: { include: { SFieldValue: { include: { SState: true } } } } } },
      },
      orderBy: { TstCreation: 'asc' },
    });
    return properties.map((p) => {
      const content = this.parse(p.AttributeContent);
      const dictionary = p.SAttribute.SFieldDictionary;
      const getValidator = (name: string) => content.validators?.find((v) => v.validationName === name);
      const num = (value: unknown): number | null => (typeof value === 'number' ? value : null);
      return {
        ideAttributeProperty: p.IdeAttributeProperty,
        codAttributeProperty: p.CodAttributeProperty,
        label: typeof content.label === 'string' ? content.label : p.DesAttributeProperty,
        type: typeof content.type === 'string' ? content.type : 'text',
        required: !!getValidator('required'),
        min: num(getValidator('min')?.aditionalProps?.['min']),
        max: num(getValidator('max')?.aditionalProps?.['max']),
        maxLength: num(getValidator('maxLength')?.aditionalProps?.['maxLength']),
        codFieldDictionary: dictionary.CodFieldDictionary,
        desFieldDictionary: dictionary.DesFieldDictionary,
        ownDictionary: dictionary.CodFieldDictionary.startsWith(OWN_DICTIONARY_PREFIX),
        options: dictionary.SFieldValue.map((v) => ({
          ideFieldValue: v.IdeFieldValue,
          desFieldValue: v.DesFieldValue,
          active: v.SState.CodState === 'ACTIVO',
        })).sort((a, b) => a.desFieldValue.localeCompare(b.desFieldValue)),
        codStage: p.CodStage,
        codState: p.SState.CodState,
      };
    });
  }

  async create(dto: CreateRiskFieldDto, actor: string): Promise<RiskFieldView[]> {
    if (!RISK_FIELD_TYPES.includes(dto.type)) throw new BadRequestException(`Tipo de campo inválido: "${dto.type}"`);
    if (dto.codStage !== undefined && !FIELD_STAGES.includes(dto.codStage)) {
      throw new BadRequestException(`Etapa inválida: "${dto.codStage}"`);
    }
    if (dto.ideRiskProduct && dto.ideProduct) {
      throw new BadRequestException('Indica solo uno: ideRiskProduct (campo de riesgo) o ideProduct (campo de producto)');
    }
    // `riskProduct` conserva el nombre por historia: aqui es el "dueno" del campo (tipo de riesgo O producto).
    const riskProduct = await this.resolveOwner(dto);

    const isList = dto.type === 'select' || dto.type === 'radio';
    const options = this.cleanOptions(dto.options);
    let reuseDictionary: { IdeFieldDictionary: string } | null = null;
    if (isList) {
      if (dto.codFieldDictionary) {
        reuseDictionary = await this.prisma.sFieldDictionary.findFirst({
          where: { CodFieldDictionary: dto.codFieldDictionary },
          select: { IdeFieldDictionary: true },
        });
        if (!reuseDictionary) throw new NotFoundException(`No existe el diccionario "${dto.codFieldDictionary}"`);
      } else if (options.length === 0) {
        throw new BadRequestException('Un campo de tipo lista necesita al menos una opción (o un diccionario existente)');
      }
    }

    const ideState = await this.stateMachine.getStateByCode('ACTIVO');
    const entities = await this.resolveEntities(riskProduct.entityCode, actor);
    const audit = (now: Date) => ({ UsrCreation: actor, TstCreation: now, UsrModification: actor, TstModification: now });

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();

      // 1. Set de atributos del riesgo (uno por tipo de riesgo; si ya hay uno activo se reutiliza).
      let model = await tx.sModelAttribute.findFirst({
        where: { IdeReference: riskProduct.IdeReference, IdeState: ideState },
        orderBy: { TstCreation: 'asc' },
      });
      if (!model) {
        model = await tx.sModelAttribute.create({
          data: {
            CodModelAttribute: await this.uniqueCode(tx, 'sModelAttribute', 'CodModelAttribute', `${riskProduct.Code}.CAMPOS`, 200),
            DesModelAttribute: `Campos personalizados ${riskProduct.Code}`,
            IdeEntityApply: entities.apply,
            IdeEntityReference: entities.reference,
            IdeReference: riskProduct.IdeReference,
            IdeState: ideState,
            ...audit(now),
          },
        });
      }

      // 2. Diccionario de valores: el elegido, o uno propio (vacío si no es lista).
      const slug = this.slug(dto.label);
      let ideFieldDictionary: string;
      let codDictionary: string;
      if (reuseDictionary) {
        ideFieldDictionary = reuseDictionary.IdeFieldDictionary;
        codDictionary = dto.codFieldDictionary!;
      } else {
        codDictionary = await this.uniqueCode(tx, 'sFieldDictionary', 'CodFieldDictionary', `${OWN_DICTIONARY_PREFIX}${slug.slice(0, 18)}`, 30);
        const dictionary = await tx.sFieldDictionary.create({
          data: { CodFieldDictionary: codDictionary, DesFieldDictionary: dto.label, IdeState: ideState, ...audit(now) },
        });
        ideFieldDictionary = dictionary.IdeFieldDictionary;
        for (const [index, option] of options.entries()) {
          await tx.sFieldValue.create({
            data: {
              CodFieldValue: await this.uniqueCode(tx, 'sFieldValue', 'CodFieldValue', `${codDictionary}_${index + 1}`, 200),
              DesFieldValue: option,
              IdeFieldDictionary: ideFieldDictionary,
              IdeState: ideState,
              ...audit(now),
            },
          });
        }
      }

      // 3. Atributo reutilizable + 4. propiedad (el campo de formulario real).
      const codBase = `${riskProduct.Code}.${slug}`;
      const attribute = await tx.sAttribute.create({
        data: {
          CodAttribute: await this.uniqueCode(tx, 'sAttribute', 'CodAttribute', codBase, 200),
          DesAttribute: dto.label,
          AttributeContent: '{}',
          IdeFieldDictionary: ideFieldDictionary,
          IdeState: ideState,
          ...audit(now),
        },
      });
      const content = this.buildContent(dto.label, dto.type, {
        required: dto.required,
        min: dto.min,
        max: dto.max,
        maxLength: dto.maxLength,
      });
      await tx.sAttributeProperty.create({
        data: {
          CodAttributeProperty: await this.uniqueCode(tx, 'sAttributeProperty', 'CodAttributeProperty', codBase, 200),
          DesAttributeProperty: dto.label,
          IdeModelAttribute: model.IdeModelAttribute,
          IdeAttribute: attribute.IdeAttribute,
          AttributeContent: JSON.stringify(content),
          CodStage: dto.codStage ?? 'PRICING',
          IdeState: ideState,
          ...audit(now),
        },
      });
    });

    return this.findByReference(riskProduct.IdeReference);
  }

  async update(ideAttributeProperty: string, dto: UpdateRiskFieldDto, actor: string): Promise<RiskFieldView[]> {
    const property = await this.prisma.sAttributeProperty.findUnique({
      where: { IdeAttributeProperty: ideAttributeProperty },
      include: { SModelAttribute: true, SAttribute: { include: { SFieldDictionary: { include: { SFieldValue: { include: { SState: true } } } } } } },
    });
    if (!property) throw new NotFoundException(`No existe el campo "${ideAttributeProperty}"`);

    const dictionary = property.SAttribute.SFieldDictionary;
    const own = dictionary.CodFieldDictionary.startsWith(OWN_DICTIONARY_PREFIX);
    if (dto.options !== undefined && !own) {
      throw new ConflictException(
        `Las opciones de este campo vienen del diccionario compartido "${dictionary.CodFieldDictionary}" y no se editan desde acá`,
      );
    }
    const content = this.parse(property.AttributeContent);
    const label = dto.label ?? (typeof content.label === 'string' ? content.label : property.DesAttributeProperty);
    const current = (name: string, prop: string): number | undefined => {
      const v = content.validators?.find((x) => x.validationName === name)?.aditionalProps?.[prop];
      return typeof v === 'number' ? v : undefined;
    };
    const pick = (value: number | null | undefined, name: string, prop: string) =>
      value === undefined ? current(name, prop) : value === null ? undefined : value;
    const hasRequired = dto.required ?? !!content.validators?.some((v) => v.validationName === 'required');
    const rebuilt = this.buildContent(label, String(content.type ?? 'text'), {
      required: hasRequired,
      min: pick(dto.min, 'min', 'min'),
      max: pick(dto.max, 'max', 'max'),
      maxLength: pick(dto.maxLength, 'maxLength', 'maxLength'),
    });
    // Conserva validadores/mensajes heredados que esta pantalla no gestiona.
    const managed = new Set(['required', 'min', 'max', 'maxLength']);
    rebuilt.validators = [...(content.validators ?? []).filter((v) => !managed.has(v.validationName)), ...(rebuilt.validators ?? [])];
    rebuilt.validationMessages = {
      ...Object.fromEntries(Object.entries(content.validationMessages ?? {}).filter(([k]) => !managed.has(k))),
      ...(rebuilt.validationMessages ?? {}),
    };
    const merged = { ...content, ...rebuilt };

    const ideState = await this.stateMachine.getStateByCode('ACTIVO');
    const ideInactive = await this.stateMachine.getStateByCode('INACTIVO');
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.sAttributeProperty.update({
        where: { IdeAttributeProperty: ideAttributeProperty },
        data: {
          DesAttributeProperty: label,
          AttributeContent: JSON.stringify(merged),
          ...(dto.codStage !== undefined ? { CodStage: dto.codStage } : {}),
          UsrModification: actor,
          TstModification: now,
        },
      });
      if (dto.label !== undefined) {
        await tx.sAttribute.update({
          where: { IdeAttribute: property.IdeAttribute },
          data: { DesAttribute: label, UsrModification: actor, TstModification: now },
        });
      }
      if (dto.options !== undefined) {
        const wanted = this.cleanOptions(dto.options);
        const existing = dictionary.SFieldValue;
        for (const value of existing) {
          const keep = wanted.includes(value.DesFieldValue);
          const active = value.SState.CodState === 'ACTIVO';
          if (keep !== active) {
            await tx.sFieldValue.update({
              where: { IdeFieldValue: value.IdeFieldValue },
              data: { IdeState: keep ? ideState : ideInactive, UsrModification: actor, TstModification: now },
            });
          }
        }
        for (const option of wanted) {
          if (existing.some((v) => v.DesFieldValue === option)) continue;
          await tx.sFieldValue.create({
            data: {
              CodFieldValue: await this.uniqueCode(tx, 'sFieldValue', 'CodFieldValue', `${dictionary.CodFieldDictionary}_${this.slug(option).slice(0, 20)}`, 200),
              DesFieldValue: option,
              IdeFieldDictionary: dictionary.IdeFieldDictionary,
              IdeState: ideState,
              UsrCreation: actor,
              TstCreation: now,
              UsrModification: actor,
              TstModification: now,
            },
          });
        }
      }
    });
    return this.findByReference(property.SModelAttribute.IdeReference);
  }

  async setState(ideAttributeProperty: string, codState: string, actor: string): Promise<RiskFieldView[]> {
    const property = await this.prisma.sAttributeProperty.findUnique({
      where: { IdeAttributeProperty: ideAttributeProperty },
      include: { SModelAttribute: true },
    });
    if (!property) throw new NotFoundException(`No existe el campo "${ideAttributeProperty}"`);
    const stateId = await this.stateMachine.getStateByCode(codState);
    await this.prisma.sAttributeProperty.update({
      where: { IdeAttributeProperty: ideAttributeProperty },
      data: { IdeState: stateId, UsrModification: actor, TstModification: new Date() },
    });
    return this.findByReference(property.SModelAttribute.IdeReference);
  }

  // ---------------------------------------------------------------- helpers

  /** Arma el JSON `AttributeContent` (mismo contrato que los campos reales: ver `getSchemaForReference`). */
  private buildContent(
    label: string,
    type: string,
    rules: { required?: boolean; min?: number; max?: number; maxLength?: number },
  ): Content {
    const validators: NonNullable<Content['validators']> = [];
    const validationMessages: Record<string, string> = {};
    if (rules.required) {
      validators.push({ validationName: 'required' });
      validationMessages['required'] = `${label} es obligatorio`;
    }
    if (type === 'number' && typeof rules.min === 'number') {
      validators.push({ validationName: 'min', aditionalProps: { min: rules.min } });
      validationMessages['min'] = `El valor mínimo es ${rules.min}`;
    }
    if (type === 'number' && typeof rules.max === 'number') {
      validators.push({ validationName: 'max', aditionalProps: { max: rules.max } });
      validationMessages['max'] = `El valor máximo es ${rules.max}`;
    }
    if (type === 'text' && typeof rules.maxLength === 'number') {
      validators.push({ validationName: 'maxLength', aditionalProps: { maxLength: rules.maxLength } });
      validationMessages['maxLength'] = `Máximo ${rules.maxLength} caracteres`;
    }
    return { name: this.slug(label), label, type, validators, validationMessages };
  }

  private parse(raw: string): Content {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Content) : {};
    } catch {
      return {};
    }
  }

  private cleanOptions(options?: string[]): string[] {
    const seen = new Set<string>();
    for (const option of options ?? []) {
      const trimmed = option.trim();
      if (trimmed) seen.add(trimmed);
    }
    return [...seen];
  }

  private slug(text: string): string {
    const base = text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase();
    return base || 'CAMPO';
  }

  /** Código único para la columna `field` de `model`: `base`, `base_2`, `base_3`... respetando el largo máximo. */
  private async uniqueCode(
    tx: Prisma.TransactionClient,
    model: 'sModelAttribute' | 'sFieldDictionary' | 'sFieldValue' | 'sAttribute' | 'sAttributeProperty',
    field: string,
    base: string,
    maxLength: number,
  ): Promise<string> {
    const delegate = tx[model] as unknown as { findFirst(args: unknown): Promise<unknown> };
    for (let i = 1; i < 1000; i++) {
      const suffix = i === 1 ? '' : `_${i}`;
      const candidate = base.slice(0, maxLength - suffix.length) + suffix;
      const found = await delegate.findFirst({ where: { [field]: candidate }, select: { [field]: true } });
      if (!found) return candidate;
    }
    throw new ConflictException(`No se pudo generar un código único a partir de "${base}"`);
  }

  /** Dueno del campo: un tipo de riesgo (`SRiskProduct`) o un producto (`SProduct`). */
  private async resolveOwner(
    dto: CreateRiskFieldDto,
  ): Promise<{ IdeReference: string; Code: string; entityCode: 'SRiskProduct' | 'SProduct' }> {
    if (dto.ideProduct) {
      const product = await this.prisma.sProduct.findUnique({
        where: { IdeProduct: dto.ideProduct },
        select: { IdeProduct: true, CodProduct: true },
      });
      if (!product) throw new NotFoundException(`No existe el producto "${dto.ideProduct}"`);
      return { IdeReference: product.IdeProduct, Code: product.CodProduct, entityCode: 'SProduct' };
    }
    const riskProduct = await this.prisma.sRiskProduct.findUnique({
      where: { IdeRiskProduct: dto.ideRiskProduct as string },
      select: { IdeRiskProduct: true, CodRiskProduct: true },
    });
    if (!riskProduct) throw new NotFoundException(`No existe el tipo de riesgo "${dto.ideRiskProduct}"`);
    return { IdeReference: riskProduct.IdeRiskProduct, Code: riskProduct.CodRiskProduct, entityCode: 'SRiskProduct' };
  }

  /**
   * Entidad (`SEntity`) a la que se aplica el set de atributos: `SRiskProduct` o `SProduct`.
   * `SProduct` se crea en el catalogo si todavia no existe (es el mismo codigo de la tabla); para
   * `SRiskProduct`, si el catalogo la nombra distinto, se copia de un set de atributos existente.
   */
  private async resolveEntities(entityCode: 'SRiskProduct' | 'SProduct', actor: string): Promise<{ apply: string; reference: string }> {
    const byCode = await this.prisma.sEntity.findFirst({ where: { CodEntity: { equals: entityCode, mode: 'insensitive' } } });
    if (byCode) return { apply: byCode.IdeEntity, reference: byCode.IdeEntity };
    if (entityCode === 'SProduct') {
      const now = new Date();
      const created = await this.prisma.sEntity.create({
        data: {
          CodEntity: 'SProduct',
          DesEntity: 'Producto',
          IdeState: await this.stateMachine.getStateByCode('ACTIVO'),
          UsrCreation: actor,
          TstCreation: now,
          UsrModification: actor,
          TstModification: now,
        },
      });
      return { apply: created.IdeEntity, reference: created.IdeEntity };
    }
    const existing = await this.prisma.sModelAttribute.findFirst({ orderBy: { TstCreation: 'asc' } });
    if (existing) return { apply: existing.IdeEntityApply, reference: existing.IdeEntityReference };
    throw new BadRequestException('No se encontró la entidad "SRiskProduct" en SEntity para crear el set de atributos');
  }
}
