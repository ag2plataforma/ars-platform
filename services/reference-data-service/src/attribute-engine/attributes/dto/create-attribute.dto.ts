import { IsJSON, IsOptional, IsString, Matches } from 'class-validator';

export class CreateAttributeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codAttribute solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codAttribute!: string;

  @IsString()
  desAttribute!: string;

  /** CodFieldDictionary del campo al que está ligado este atributo (debe existir). */
  @IsString()
  codFieldDictionary!: string;

  /**
   * JSON libre, como texto (la columna real es `varchar`, no `json`). En
   * los datos reales investigados siempre viene `"{}"` a este nivel -- el
   * schema real del campo de formulario vive en
   * `SAttributeProperty.AttributeContent` (ver `../attribute-properties/`),
   * no acá. Opcional, default `"{}"`.
   */
  @IsOptional()
  @IsJSON()
  attributeContent?: string;
}
