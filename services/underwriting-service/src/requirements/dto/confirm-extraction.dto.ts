import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';

export class ExtractedFieldDto {
  @IsString()
  @MaxLength(60)
  @Matches(/^[A-Za-z0-9_]+$/, { message: 'key solo admite letras, números y guion bajo' })
  key!: string;

  @IsString()
  @MaxLength(120)
  label!: string;

  @IsString()
  @MaxLength(500)
  value!: string;
}

/**
 * Datos extraídos por la IA, YA revisados (y posiblemente corregidos) por el
 * operador, que se guardan en `Data.extraction` del requisito. Una lista
 * vacía borra la extracción guardada.
 */
export class ConfirmExtractionDto {
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ExtractedFieldDto)
  fields!: ExtractedFieldDto[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  documentType?: string;

  /** Id de la llamada a la IA (`TAiRequest`) de la que salió la propuesta. */
  @IsOptional()
  @IsUUID()
  idAiRequest?: string;
}
