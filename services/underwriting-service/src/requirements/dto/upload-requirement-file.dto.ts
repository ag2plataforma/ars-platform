import { IsString, MinLength } from 'class-validator';

/**
 * Body de la subida del archivo real de un requisito -- Etapa 2 (ver
 * docs/02-roadmap.md ítem 4, pedido explícito del usuario). Mismo
 * criterio que `CreateTemplateDto.fileBase64` en documents-service: el
 * archivo viaja en base64 dentro del body JSON (no multipart), para
 * pasar sin cambios por el proxy del gateway. Usado tanto para
 * `TQuoteRequirement` como para `TContractRequirement` -- mismo shape
 * para los dos.
 */
export class UploadRequirementFileDto {
  @IsString()
  @MinLength(1)
  fileName!: string;

  @IsString()
  @MinLength(1)
  fileBase64!: string;
}
