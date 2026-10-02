import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, TPerson } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { LookupPersonDto } from './dto/lookup-person.dto';
import { ListPersonsDto } from './dto/list-persons.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { CreateContactDataDto } from './dto/create-contact-data.dto';
import { UpdateContactDataDto } from './dto/update-contact-data.dto';

/**
 * `TPerson`/`TAddress`/`TContactData` -- confirmado contra el código
 * real (`packages/database/scripts/investigate-party-service.js`):
 * ninguna de las tres tiene función PL/pgSQL propia de escritura (solo
 * existe `FPerson_GetBy`, de solo lectura) -- eran CRUD directo de la
 * capa LoopBack original, igual que pasaba con `TQuote`/`TQuoteRisk` en
 * el motor de cotización.
 *
 * Se crean directamente en estado "Activo" -- no hay un estado "Initial"
 * de borrador para personas (`FPerson_GetBy`/`FConsent` siempre filtran
 * direcciones/contactos por estado "Activo", nunca por "Initial", y
 * ninguna función los mueve de un estado a otro).
 *
 * `IndLead`/`IndClient` (deliberado, confirmado contra `FContractPerson`
 * real): toda persona creada acá nace `IndLead=true`/`IndClient=false`.
 * El original solo pone `IndClient=true` + `TstRelationshipStart=now()`
 * al crear un CONTRATO (`FContractPerson('SETQUOTE',...)`), nunca antes
 * -- ese paso es de underwriting-service (`ContractsService.
 * setContractPersons`), no de este servicio. Mutuamente excluyentes
 * desde el `update` agregado ahí (2026-10-02, pedido explícito del
 * usuario): ese mismo paso también apaga `IndLead` -- un cliente no
 * vuelve a ser "lead" aunque después genere una cotización nueva.
 *
 * Reglas agregadas explícitamente, ausentes como validación en el
 * original (que dependía del frontend Angular para no ofrecer más de
 * una principal): una única dirección principal (`IndMain`) y un único
 * dato de contacto principal por clase (`SContactClass`) por persona --
 * marcar uno como principal desmarca los demás, mismo criterio que
 * `selectPlan` en el motor de cotización de underwriting-service.
 *
 * `data: ... as any` en las escrituras de varios campos opcionales es
 * deliberado -- mismo criterio que `CatalogCrudService`/
 * `RiskLevelsService.buildExtra`: no vale la pena pelear con el tipo
 * generado por Prisma para un objeto de creación/actualización parcial
 * con muchos campos opcionales.
 */
@Injectable()
export class PersonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  /**
   * Listado paginado de "Personas" (CRM-lite, docs/02-roadmap.md item 6)
   * -- hasta ahora `TPerson` solo se buscaba al vuelo (`lookup`/`search`,
   * acotado a 20 resultados) dentro de un flujo puntual (Cotización,
   * Corredores). Mismo patrón que `ContractsService.findAll`: `where`
   * armado a partir de los filtros, `Promise.all` de `findMany`+`count`,
   * respuesta `{items, total, page, limit}`.
   */
  private static readonly SORTABLE_FIELDS: Record<
    string,
    (dir: Prisma.SortOrder) => Prisma.TPersonOrderByWithRelationInput
  > = {
    desFirstName: (dir) => ({ DesFirstName: dir }),
    desLastName1: (dir) => ({ DesLastName1: dir }),
    desEmail: (dir) => ({ DesEmail: dir }),
    numIdentification: (dir) => ({ NumIdentification: dir }),
    tstCreation: (dir) => ({ TstCreation: dir }),
  };

  private resolveOrderBy(query: ListPersonsDto): Prisma.TPersonOrderByWithRelationInput {
    const factory = query.sortField ? PersonsService.SORTABLE_FIELDS[query.sortField] : undefined;
    if (!factory) return { TstCreation: 'desc' };
    return factory(query.sortOrder === -1 ? 'desc' : 'asc');
  }

  async findAll(query: ListPersonsDto) {
    const terms = query.q
      ? query.q
          .trim()
          .split(/\s+/)
          .filter(Boolean)
      : [];

    const where: Prisma.TPersonWhereInput = {
      ...(query.indLead !== undefined ? { IndLead: query.indLead } : {}),
      ...(query.indClient !== undefined ? { IndClient: query.indClient } : {}),
      ...(terms.length > 0
        ? {
            AND: terms.map((term) => ({
              OR: [
                { DesFirstName: { contains: term, mode: 'insensitive' as const } },
                { DesMiddleName: { contains: term, mode: 'insensitive' as const } },
                { DesLastName1: { contains: term, mode: 'insensitive' as const } },
                { DesLastName2: { contains: term, mode: 'insensitive' as const } },
                { DesEmail: { contains: term, mode: 'insensitive' as const } },
                { NumIdentification: { contains: term, mode: 'insensitive' as const } },
              ],
            })),
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.tPerson.findMany({
        where,
        orderBy: this.resolveOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.tPerson.count({ where }),
    ]);

    return { items: rows, total, page: query.page, limit: query.limit };
  }

  /**
   * Cotizaciones/contratos donde aparece esta persona -- pedido
   * explícito del usuario al definir el alcance de "Personas" (CRM-lite:
   * poder ver desde la persona qué cotizó/contrató). Vía Prisma directo
   * sobre tablas que "pertenecen" a underwriting-service, mismo criterio
   * ya establecido en todo el monorepo (un solo schema compartido;
   * `ContractsService`/`QuotesService` ya acceden a `TPerson` directo sin
   * pasar por este servicio) -- no amerita un cliente HTTP para una
   * lectura simple.
   *
   * Cotizaciones: `TQuote.IdePerson` (Tomador, FK directa) UNIDO con
   * `TQuotePerson` (cualquier otro rol, ej. Titular) -- una persona
   * puede aparecer en una cotización por cualquiera de las dos vías,
   * deduplicado por `IdeQuote`. Contratos: únicamente vía
   * `TContractPerson` (no hay FK directa de persona en `TContract`).
   * No se agrega a `findOne` (que varios llamadores ya consumen con un
   * shape fijo, ej. el diálogo "Cambiar datos" de Tomador/Titular) --
   * endpoint aparte para no romper esos consumidores.
   */
  async findRelated(idePerson: string) {
    await this.findOne(idePerson);

    const [quotesAsTomador, quotePersonRows, contractPersonRows] = await Promise.all([
      this.prisma.tQuote.findMany({
        where: { IdePerson: idePerson },
        select: {
          IdeQuote: true,
          NumQuote: true,
          TstCreation: true,
          SProduct: { select: { DesProduct: true } },
          SState: { select: { CodState: true, DesState: true } },
        },
      }),
      this.prisma.tQuotePerson.findMany({
        where: { IdePerson: idePerson },
        select: {
          SPersonRol: { select: { DesPersonRol: true } },
          TQuote: {
            select: {
              IdeQuote: true,
              NumQuote: true,
              TstCreation: true,
              SProduct: { select: { DesProduct: true } },
              SState: { select: { CodState: true, DesState: true } },
            },
          },
        },
      }),
      this.prisma.tContractPerson.findMany({
        where: { IdePerson: idePerson },
        select: {
          SPersonRol: { select: { DesPersonRol: true } },
          TContract: {
            select: {
              IdeContract: true,
              NumContract: true,
              TstCreation: true,
              SProduct: { select: { DesProduct: true } },
              SState: { select: { CodState: true, DesState: true } },
            },
          },
        },
      }),
    ]);

    const quoteById = new Map<
      string,
      { ideQuote: string; numQuote: string; desProduct: string; codState: string; desState: string; tstCreation: Date }
    >();
    for (const q of quotesAsTomador) {
      quoteById.set(q.IdeQuote, {
        ideQuote: q.IdeQuote,
        numQuote: q.NumQuote,
        desProduct: q.SProduct.DesProduct,
        codState: q.SState.CodState,
        desState: q.SState.DesState,
        tstCreation: q.TstCreation,
      });
    }
    for (const row of quotePersonRows) {
      if (!quoteById.has(row.TQuote.IdeQuote)) {
        quoteById.set(row.TQuote.IdeQuote, {
          ideQuote: row.TQuote.IdeQuote,
          numQuote: row.TQuote.NumQuote,
          desProduct: row.TQuote.SProduct.DesProduct,
          codState: row.TQuote.SState.CodState,
          desState: row.TQuote.SState.DesState,
          tstCreation: row.TQuote.TstCreation,
        });
      }
    }

    const contractById = new Map<
      string,
      {
        ideContract: string;
        numContract: string;
        desProduct: string;
        codState: string;
        desState: string;
        tstCreation: Date;
      }
    >();
    for (const row of contractPersonRows) {
      if (!contractById.has(row.TContract.IdeContract)) {
        contractById.set(row.TContract.IdeContract, {
          ideContract: row.TContract.IdeContract,
          numContract: row.TContract.NumContract,
          desProduct: row.TContract.SProduct.DesProduct,
          codState: row.TContract.SState.CodState,
          desState: row.TContract.SState.DesState,
          tstCreation: row.TContract.TstCreation,
        });
      }
    }

    const sortByDateDesc = <T extends { tstCreation: Date }>(rows: T[]): T[] =>
      [...rows].sort((a, b) => b.tstCreation.getTime() - a.tstCreation.getTime());

    return {
      quotes: sortByDateDesc([...quoteById.values()]),
      contracts: sortByDateDesc([...contractById.values()]),
    };
  }

  async create(dto: CreatePersonDto, actor: string) {
    await this.assertNoDuplicate(dto.desEmail, dto.numIdentification, dto.ideIdentificationType);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();

    const data: Record<string, unknown> = {
      DesFirstName: dto.desFirstName,
      DesEmail: dto.desEmail,
      IndLead: true,
      IndClient: false,
      IdeState: activeStateId,
      UsrCreation: actor,
      TstCreation: now,
      UsrModification: actor,
      TstModification: now,
    };
    if (dto.ideIdentificationType !== undefined) data.IdeIdentificationType = dto.ideIdentificationType;
    if (dto.numIdentification !== undefined) data.NumIdentification = dto.numIdentification;
    if (dto.desMiddleName !== undefined) data.DesMiddleName = dto.desMiddleName;
    if (dto.desLastName1 !== undefined) data.DesLastName1 = dto.desLastName1;
    if (dto.desLastName2 !== undefined) data.DesLastName2 = dto.desLastName2;
    if (dto.ideGender !== undefined) data.IdeGender = dto.ideGender;
    if (dto.tstBirthdate !== undefined) data.TstBirthdate = new Date(dto.tstBirthdate);
    if (dto.desBirthPlace !== undefined) data.DesBirthPlace = dto.desBirthPlace;
    if (dto.ideCountryBirth !== undefined) data.IdeCountryBirth = dto.ideCountryBirth;
    if (dto.ideLocationBirth !== undefined) data.IdeLocationBirth = dto.ideLocationBirth;
    if (dto.ideProfession !== undefined) data.IdeProfession = dto.ideProfession;
    if (dto.ideBusinessActivity !== undefined) data.IdeBusinessActivity = dto.ideBusinessActivity;
    if (dto.ideMaritalStatus !== undefined) data.IdeMaritalStatus = dto.ideMaritalStatus;
    if (dto.objCustomData !== undefined) data.ObjCustomData = dto.objCustomData;
    if (dto.codExternal !== undefined) data.CodExternal = dto.codExternal;

    return this.prisma.tPerson.create({ data: data as any });
  }

  async findOne(id: string) {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const person = await this.prisma.tPerson.findUnique({
      where: { IdePerson: id },
      include: {
        TAddress: { where: { IdeState: activeStateId } },
        TContactData: { where: { IdeState: activeStateId }, include: { SContactClass: true } },
      },
    });
    if (!person) {
      throw new NotFoundException(`No existe persona con id "${id}"`);
    }
    return person;
  }

  async lookup(query: LookupPersonDto) {
    if (!query.idePerson && !query.numIdentification && !query.email) {
      throw new BadRequestException('Debe suministrarse al menos un criterio de búsqueda');
    }
    const person = await this.prisma.tPerson.findFirst({
      where: {
        ...(query.idePerson ? { IdePerson: query.idePerson } : {}),
        ...(query.email ? { DesEmail: query.email } : {}),
        ...(query.numIdentification ? { NumIdentification: query.numIdentification } : {}),
      },
    });
    if (!person) {
      throw new NotFoundException('No se encontró ninguna persona con esos criterios');
    }
    return this.findOne(person.IdePerson);
  }

  /**
   * Búsqueda por nombre (`q`, texto libre) -- complementaria a `lookup`
   * (coincidencia exacta por DNI/email, pensada para un único
   * resultado). Acá puede haber varias personas con nombres parecidos,
   * así que devuelve una lista, no un único objeto ni 404 si no hay
   * coincidencias. `q` se separa en palabras y CADA una debe aparecer
   * (insensible a mayúsculas/acentos no -- Postgres `contains` con
   * `mode: 'insensitive'` no normaliza acentos) en ALGUNO de los 4
   * campos de nombre -- así "juan perez" matchea a alguien con
   * `DesFirstName="Juan"`/`DesLastName1="Perez"` sin exigir que un único
   * campo contenga la cadena completa. Tope de 20 resultados, pensado
   * para un selector en pantalla, no para un reporte.
   */
  async search(q: string): Promise<TPerson[]> {
    const terms = q
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (terms.length === 0) {
      return [];
    }
    return this.prisma.tPerson.findMany({
      where: {
        AND: terms.map((term) => ({
          OR: [
            { DesFirstName: { contains: term, mode: 'insensitive' as const } },
            { DesMiddleName: { contains: term, mode: 'insensitive' as const } },
            { DesLastName1: { contains: term, mode: 'insensitive' as const } },
            { DesLastName2: { contains: term, mode: 'insensitive' as const } },
          ],
        })),
      },
      orderBy: [{ DesFirstName: 'asc' }, { DesLastName1: 'asc' }],
      take: 20,
    });
  }

  async update(id: string, dto: UpdatePersonDto, actor: string) {
    await this.findOne(id);
    if (dto.desEmail !== undefined || dto.numIdentification !== undefined) {
      await this.assertNoDuplicate(dto.desEmail, dto.numIdentification, dto.ideIdentificationType, id);
    }

    const data: Record<string, unknown> = { UsrModification: actor, TstModification: new Date() };
    if (dto.ideIdentificationType !== undefined) data.IdeIdentificationType = dto.ideIdentificationType;
    if (dto.numIdentification !== undefined) data.NumIdentification = dto.numIdentification;
    if (dto.desFirstName !== undefined) data.DesFirstName = dto.desFirstName;
    if (dto.desMiddleName !== undefined) data.DesMiddleName = dto.desMiddleName;
    if (dto.desLastName1 !== undefined) data.DesLastName1 = dto.desLastName1;
    if (dto.desLastName2 !== undefined) data.DesLastName2 = dto.desLastName2;
    if (dto.desEmail !== undefined) data.DesEmail = dto.desEmail;
    if (dto.ideGender !== undefined) data.IdeGender = dto.ideGender;
    if (dto.tstBirthdate !== undefined) data.TstBirthdate = new Date(dto.tstBirthdate);
    if (dto.desBirthPlace !== undefined) data.DesBirthPlace = dto.desBirthPlace;
    if (dto.ideCountryBirth !== undefined) data.IdeCountryBirth = dto.ideCountryBirth;
    if (dto.ideLocationBirth !== undefined) data.IdeLocationBirth = dto.ideLocationBirth;
    if (dto.ideProfession !== undefined) data.IdeProfession = dto.ideProfession;
    if (dto.ideBusinessActivity !== undefined) data.IdeBusinessActivity = dto.ideBusinessActivity;
    if (dto.ideMaritalStatus !== undefined) data.IdeMaritalStatus = dto.ideMaritalStatus;
    if (dto.objCustomData !== undefined) data.ObjCustomData = dto.objCustomData;
    if (dto.codExternal !== undefined) data.CodExternal = dto.codExternal;

    await this.prisma.tPerson.update({ where: { IdePerson: id }, data: data as any });
    return this.findOne(id);
  }

  async addAddress(idePerson: string, dto: CreateAddressDto, actor: string) {
    await this.findOne(idePerson);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();
    const indMain = dto.indMain ?? true;

    if (indMain) {
      await this.prisma.tAddress.updateMany({
        where: { IdePerson: idePerson, IndMain: true },
        data: { IndMain: false, UsrModification: actor, TstModification: now },
      });
    }

    const data: Record<string, unknown> = {
      IdePerson: idePerson,
      DesAddressLine1: dto.desAddressLine1,
      CodPostal: dto.codPostal,
      IndMain: indMain,
      IdeState: activeStateId,
      UsrCreation: actor,
      TstCreation: now,
      UsrModification: actor,
      TstModification: now,
    };
    if (dto.desAddressLine2 !== undefined) data.DesAddressLine2 = dto.desAddressLine2;
    if (dto.ideCountry !== undefined) data.IdeCountry = dto.ideCountry;
    if (dto.latitude !== undefined) data.Latitude = dto.latitude;
    if (dto.longitude !== undefined) data.Longitude = dto.longitude;

    return this.prisma.tAddress.create({ data: data as any });
  }

  async updateAddress(idePerson: string, ideAddress: string, dto: UpdateAddressDto, actor: string) {
    const address = await this.prisma.tAddress.findFirst({
      where: { IdeAddress: ideAddress, IdePerson: idePerson },
    });
    if (!address) {
      throw new NotFoundException(`No existe dirección "${ideAddress}" para la persona "${idePerson}"`);
    }
    const now = new Date();
    if (dto.indMain === true) {
      await this.prisma.tAddress.updateMany({
        where: { IdePerson: idePerson, IndMain: true, NOT: { IdeAddress: ideAddress } },
        data: { IndMain: false, UsrModification: actor, TstModification: now },
      });
    }

    const data: Record<string, unknown> = { UsrModification: actor, TstModification: now };
    if (dto.desAddressLine1 !== undefined) data.DesAddressLine1 = dto.desAddressLine1;
    if (dto.desAddressLine2 !== undefined) data.DesAddressLine2 = dto.desAddressLine2;
    if (dto.ideCountry !== undefined) data.IdeCountry = dto.ideCountry;
    if (dto.codPostal !== undefined) data.CodPostal = dto.codPostal;
    if (dto.indMain !== undefined) data.IndMain = dto.indMain;
    if (dto.latitude !== undefined) data.Latitude = dto.latitude;
    if (dto.longitude !== undefined) data.Longitude = dto.longitude;

    return this.prisma.tAddress.update({ where: { IdeAddress: ideAddress }, data: data as any });
  }

  async addContactData(idePerson: string, dto: CreateContactDataDto, actor: string) {
    await this.findOne(idePerson);
    const ideContactClass = await this.resolveContactClass(dto.codContactClass);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();
    const indMain = dto.indMain ?? true;

    if (indMain) {
      await this.prisma.tContactData.updateMany({
        where: { IdePerson: idePerson, IdeContactClass: ideContactClass, IndMain: true },
        data: { IndMain: false, UsrModification: actor, TstModification: now },
      });
    }

    return this.prisma.tContactData.create({
      data: {
        IdePerson: idePerson,
        IdeContactClass: ideContactClass,
        DesContactData: dto.desContactData,
        IndMain: indMain,
        IdeState: activeStateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      } as any,
    });
  }

  async updateContactData(idePerson: string, ideContactData: string, dto: UpdateContactDataDto, actor: string) {
    const contactData = await this.prisma.tContactData.findFirst({
      where: { IdeContactData: ideContactData, IdePerson: idePerson },
    });
    if (!contactData) {
      throw new NotFoundException(`No existe dato de contacto "${ideContactData}" para la persona "${idePerson}"`);
    }
    const now = new Date();
    const ideContactClass = dto.codContactClass
      ? await this.resolveContactClass(dto.codContactClass)
      : contactData.IdeContactClass;

    if (dto.indMain === true) {
      await this.prisma.tContactData.updateMany({
        where: {
          IdePerson: idePerson,
          IdeContactClass: ideContactClass,
          IndMain: true,
          NOT: { IdeContactData: ideContactData },
        },
        data: { IndMain: false, UsrModification: actor, TstModification: now },
      });
    }

    const data: Record<string, unknown> = { UsrModification: actor, TstModification: now };
    if (dto.codContactClass !== undefined) data.IdeContactClass = ideContactClass;
    if (dto.desContactData !== undefined) data.DesContactData = dto.desContactData;
    if (dto.indMain !== undefined) data.IndMain = dto.indMain;

    return this.prisma.tContactData.update({ where: { IdeContactData: ideContactData }, data: data as any });
  }

  private async resolveContactClass(codContactClass: string): Promise<string> {
    const row = await this.prisma.sContactClass.findFirst({ where: { CodContactClass: codContactClass } });
    if (!row) {
      throw new NotFoundException(`No existe clase de contacto con código "${codContactClass}"`);
    }
    return row.IdeContactClass;
  }

  private async assertNoDuplicate(
    desEmail?: string,
    numIdentification?: string,
    ideIdentificationType?: string,
    excludeId?: string,
  ): Promise<void> {
    if (desEmail) {
      const existing = await this.prisma.tPerson.findFirst({ where: { DesEmail: desEmail } });
      if (existing && existing.IdePerson !== excludeId) {
        throw new ConflictException(`Ya existe una persona con el email "${desEmail}"`);
      }
    }
    if (numIdentification && ideIdentificationType) {
      const existing = await this.prisma.tPerson.findFirst({
        where: { NumIdentification: numIdentification, IdeIdentificationType: ideIdentificationType },
      });
      if (existing && existing.IdePerson !== excludeId) {
        throw new ConflictException('Ya existe una persona con esa identificación');
      }
    }
  }
}
