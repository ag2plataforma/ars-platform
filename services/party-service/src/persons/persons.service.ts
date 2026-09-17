import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { LookupPersonDto } from './dto/lookup-person.dto';
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
 * -- ese paso es de underwriting-service (fase de contratación,
 * todavía no implementada), no de este servicio.
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
