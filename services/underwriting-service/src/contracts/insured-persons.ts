import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@ars-platform/database';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { InsuredPersonDto } from './dto/insured-person.dto';
import { normalizeIdentification } from './normalize-identification';

/** Campos de persona que un producto puede pedir para el asegurado de un riesgo tipo persona. */
export const INSURED_PERSON_FIELDS = [
  'firstName',
  'middleName',
  'lastName1',
  'lastName2',
  'document',
  'birthdate',
  'gender',
  'maritalStatus',
  'profession',
  'birthPlace',
  'email',
] as const;
export type InsuredPersonField = (typeof INSURED_PERSON_FIELDS)[number];
export type InsuredFieldMode = 'NONE' | 'OPTIONAL' | 'REQUIRED';
export type InsuredPersonConfig = Record<InsuredPersonField, InsuredFieldMode>;

/** Minimo por defecto: nombre, primer apellido, documento y fecha de nacimiento. */
export const DEFAULT_INSURED_PERSON_CONFIG: InsuredPersonConfig = {
  firstName: 'REQUIRED',
  middleName: 'NONE',
  lastName1: 'REQUIRED',
  lastName2: 'NONE',
  document: 'REQUIRED',
  birthdate: 'REQUIRED',
  gender: 'NONE',
  maritalStatus: 'NONE',
  profession: 'NONE',
  birthPlace: 'NONE',
  email: 'NONE',
};

const LABELS: Record<InsuredPersonField, string> = {
  firstName: 'nombre',
  middleName: 'segundo nombre',
  lastName1: 'primer apellido',
  lastName2: 'segundo apellido',
  document: 'documento de identidad',
  birthdate: 'fecha de nacimiento',
  gender: 'sexo',
  maritalStatus: 'estado civil',
  profession: 'profesión',
  birthPlace: 'lugar de nacimiento',
  email: 'correo',
};

/** Normaliza lo guardado en `SProduct.ObjInsuredPersonFields` (null = minimo por defecto). El nombre siempre es obligatorio. */
export function resolveInsuredPersonConfig(raw: unknown): InsuredPersonConfig {
  const config: InsuredPersonConfig = { ...DEFAULT_INSURED_PERSON_CONFIG };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const field of INSURED_PERSON_FIELDS) {
      const value = (raw as Record<string, unknown>)[field];
      if (value === 'NONE' || value === 'OPTIONAL' || value === 'REQUIRED') config[field] = value;
    }
  }
  config.firstName = 'REQUIRED';
  return config;
}

function isFilled(person: InsuredPersonDto, field: InsuredPersonField): boolean {
  const has = (v: unknown) => typeof v === 'string' && v.trim() !== '';
  switch (field) {
    case 'firstName': return has(person.desFirstName);
    case 'middleName': return has(person.desMiddleName);
    case 'lastName1': return has(person.desLastName1);
    case 'lastName2': return has(person.desLastName2);
    case 'document': return has(person.ideIdentificationType) && has(person.numIdentification);
    case 'birthdate': return has(person.tstBirthdate);
    case 'gender': return has(person.ideGender);
    case 'maritalStatus': return has(person.ideMaritalStatus);
    case 'profession': return has(person.ideProfession);
    case 'birthPlace': return has(person.desBirthPlace);
    case 'email': return has(person.desEmail);
  }
}

/** Valida formato (uuid, correo, fecha...) de los datos crudos recibidos para un asegurado. */
export function parseInsuredPerson(raw: unknown, label: string): InsuredPersonDto {
  const instance = plainToInstance(InsuredPersonDto, raw ?? {});
  const errors = validateSync(instance, { whitelist: true });
  if (errors.length > 0) {
    const detail = errors.flatMap((e) => Object.values(e.constraints ?? {})).join('; ');
    throw new BadRequestException(`${label}: datos de la persona asegurada inválidos (${detail})`);
  }
  return instance;
}

/** Valida los datos de un asegurado contra la configuracion del producto. */
export function assertInsuredPersonComplete(person: InsuredPersonDto, config: InsuredPersonConfig, label: string): void {
  const missing = INSURED_PERSON_FIELDS.filter((f) => config[f] === 'REQUIRED' && !isFilled(person, f)).map((f) => LABELS[f]);
  if (missing.length > 0) {
    throw new BadRequestException(`${label}: faltan datos obligatorios de la persona asegurada (${missing.join(', ')})`);
  }
  const hasType = !!person.ideIdentificationType?.trim();
  const hasNum = !!person.numIdentification?.trim();
  if (hasType !== hasNum) {
    throw new BadRequestException(`${label}: el documento necesita tipo y número`);
  }
}

/**
 * Busca la persona por documento (identidad); si no hay documento, solo reutiliza una con el mismo
 * correo + nombre (+ apellido + nacimiento si se indican) y sin documento. Si no existe, la crea.
 * El correo es compartible: si no se informa se usa el del tomador.
 */
export async function findOrCreateInsuredPerson(
  person: InsuredPersonDto,
  config: InsuredPersonConfig,
  holderEmail: string,
  ideActiveState: string,
  actor: string,
  tx: Prisma.TransactionClient,
): Promise<string> {
  const firstName = person.desFirstName!.trim();
  const lastName1 = person.desLastName1?.trim() || null;
  const email = (config.email !== 'NONE' && person.desEmail?.trim()) || holderEmail;
  const ideType = person.ideIdentificationType?.trim() || undefined;
  const numDoc = normalizeIdentification(person.numIdentification);

  if (ideType && numDoc) {
    // Misma persona si coincide tipo+numero, o si se registro con ese numero pero SIN tipo (ej. el tomador creado
    // en el paso Personas de la cotizacion): se reutiliza y se le completa el tipo, en vez de duplicarla.
    const byDoc =
      (await tx.tPerson.findFirst({
        where: { IdeIdentificationType: ideType, NumIdentification: { equals: numDoc, mode: 'insensitive' } },
      })) ??
      (await tx.tPerson.findFirst({
        where: { IdeIdentificationType: null, NumIdentification: { equals: numDoc, mode: 'insensitive' } },
      }));
    if (byDoc) {
      await fillMissingPersonData(byDoc, person, numDoc, actor, tx);
      return byDoc.IdePerson;
    }
  } else {
    const same = await tx.tPerson.findFirst({
      where: {
        NumIdentification: null,
        DesEmail: { equals: email, mode: 'insensitive' },
        DesFirstName: { equals: firstName, mode: 'insensitive' },
        ...(lastName1 ? { DesLastName1: { equals: lastName1, mode: 'insensitive' as const } } : {}),
        ...(person.tstBirthdate ? { TstBirthdate: new Date(person.tstBirthdate) } : {}),
      },
    });
    if (same) {
      await fillMissingPersonData(same, person, undefined, actor, tx);
      return same.IdePerson;
    }
  }

  const now = new Date();
  const created = await tx.tPerson.create({
    data: {
      DesFirstName: firstName,
      DesMiddleName: person.desMiddleName?.trim() || null,
      DesLastName1: lastName1,
      DesLastName2: person.desLastName2?.trim() || null,
      DesEmail: email,
      IdeIdentificationType: ideType ?? null,
      NumIdentification: numDoc ?? null,
      TstBirthdate: person.tstBirthdate ? new Date(person.tstBirthdate) : null,
      IdeGender: person.ideGender || null,
      IdeMaritalStatus: person.ideMaritalStatus || null,
      IdeProfession: person.ideProfession || null,
      DesBirthPlace: person.desBirthPlace?.trim() || null,
      IndLead: true,
      IndClient: false,
      IdeState: ideActiveState,
      UsrCreation: actor,
      TstCreation: now,
      UsrModification: actor,
      TstModification: now,
    },
  });
  return created.IdePerson;
}

type ExistingPerson = {
  IdePerson: string;
  IdeIdentificationType: string | null;
  NumIdentification: string | null;
  DesMiddleName: string | null;
  DesLastName1: string | null;
  DesLastName2: string | null;
  TstBirthdate: Date | null;
  IdeGender: string | null;
  IdeMaritalStatus: string | null;
  IdeProfession: string | null;
  DesBirthPlace: string | null;
};

/**
 * Una persona que ya existe se COMPLETA con los datos que se hayan informado al contratar y que ella no tenia
 * (ej. la fecha de nacimiento). Lo que ya tiene valor NO se pisa: un dato mal tecleado en una contratacion no
 * debe alterar la ficha de la persona para el resto de contratos. Tambien deja el documento en mayusculas.
 */
async function fillMissingPersonData(
  existing: ExistingPerson,
  person: InsuredPersonDto,
  normalizedDocument: string | undefined,
  actor: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const text = (value?: string | null) => value?.trim() || undefined;
  const data: Prisma.TPersonUncheckedUpdateInput = {};
  if (!existing.IdeIdentificationType && text(person.ideIdentificationType)) data.IdeIdentificationType = person.ideIdentificationType;
  if (!existing.DesMiddleName && text(person.desMiddleName)) data.DesMiddleName = text(person.desMiddleName);
  if (!existing.DesLastName1 && text(person.desLastName1)) data.DesLastName1 = text(person.desLastName1);
  if (!existing.DesLastName2 && text(person.desLastName2)) data.DesLastName2 = text(person.desLastName2);
  if (!existing.TstBirthdate && text(person.tstBirthdate)) data.TstBirthdate = new Date(person.tstBirthdate!);
  if (!existing.IdeGender && text(person.ideGender)) data.IdeGender = person.ideGender;
  if (!existing.IdeMaritalStatus && text(person.ideMaritalStatus)) data.IdeMaritalStatus = person.ideMaritalStatus;
  if (!existing.IdeProfession && text(person.ideProfession)) data.IdeProfession = person.ideProfession;
  if (!existing.DesBirthPlace && text(person.desBirthPlace)) data.DesBirthPlace = text(person.desBirthPlace);
  if (normalizedDocument && existing.NumIdentification && existing.NumIdentification !== normalizedDocument) {
    data.NumIdentification = normalizedDocument;
  }
  if (Object.keys(data).length === 0) return;
  await tx.tPerson.update({
    where: { IdePerson: existing.IdePerson },
    data: { ...data, UsrModification: actor, TstModification: new Date() },
  });
}
