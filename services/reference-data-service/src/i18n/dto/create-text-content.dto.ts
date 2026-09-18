import { IsOptional, IsString } from 'class-validator';

/**
 * `STextContent` es el "grupo de traducción" que referencian ~60 tablas
 * del esquema vía su propio `IdeTextContent` opcional (ver
 * `packages/database/prisma/schema.prisma`) -- este módulo solo
 * administra el grupo y sus traducciones (`STranslator`); los demás
 * módulos/servicios que quieran enlazar una fila propia a un grupo de
 * traducción reciben su `IdeTextContent` (uuid) tal cual, sin validar
 * (mismo criterio que `IdeReference` en `SModelAttribute`).
 */
export class CreateTextContentDto {
  /** Idioma "base"/original del contenido (columna propia de STextContent, opcional). */
  @IsOptional()
  @IsString()
  codLanguage?: string;
}
