import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

/** Tipos de documento soportados en esta primera versión (alcance
 *  acordado con el usuario: arrancar por "Póliza/Contrato emitido",
 *  dejando los otros tres ya listados para cuando se implementen sus
 *  disparadores reales). */
export const TEMPLATE_TYPES = ['CONTRATO', 'RECIBO', 'COTIZACION', 'COMUNICADO'] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

export class CreateTemplateDto {
  @IsUUID()
  ideOperationProduct!: string;

  @IsIn([...TEMPLATE_TYPES])
  codTemplateType!: TemplateType;

  @IsUUID()
  idePersonRol!: string;

  @IsInt()
  @Min(1)
  numOrder!: number;

  @IsString()
  @MinLength(1)
  fileName!: string;

  /** Contenido del .docx en base64 -- ver doc-comment de main.ts: viaja
   *  así (no multipart) para pasar sin cambios por el proxy del gateway. */
  @IsString()
  @MinLength(1)
  fileBase64!: string;
}

/** Reemplaza el archivo de una plantilla ya creada (ej. corregir un
 *  typo en el Word) sin tener que borrar y volver a cargar toda la fila
 *  (el activar/desactivar va aparte, ver `SetTemplateStateDto`). */
export class ReplaceTemplateFileDto {
  @IsString()
  @MinLength(1)
  fileName!: string;

  @IsString()
  @MinLength(1)
  fileBase64!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  numOrder?: number;
}

/** Activa (`true`) o desactiva (`false`) una plantilla. */
export class SetTemplateStateDto {
  @IsBoolean()
  active!: boolean;
}
