import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CreateModelAttributeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codModelAttribute solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codModelAttribute!: string;

  @IsString()
  desModelAttribute!: string;

  /** CodEntity de la entidad a la que se le aplica este set de atributos (debe existir). */
  @IsString()
  codEntityApply!: string;

  /**
   * CodEntity de la entidad de referencia (debe existir). En los datos
   * reales investigados casi siempre coincide con `codEntityApply`.
   */
  @IsString()
  codEntityReference!: string;

  /**
   * Id (uuid) del `SFlowStep` puntual al que aplica este set de
   * atributos, si aplica solo en un paso del flujo. `SFlowStep` no tiene
   * código propio (ver `../flow-steps/`), así que se referencia por id,
   * no por código. En los datos reales investigados casi siempre viene
   * vacío (el set de atributos aplica sin importar el paso).
   */
  @IsOptional()
  @IsUUID()
  ideFlowStep?: string;

  /**
   * Id (uuid) crudo, sin resolver ni validar contra ninguna tabla:
   * referencia polimórfica -- confirmado en el schema real que
   * `SModelAttribute.IdeReference` no tiene FK declarada, a qué tabla
   * apunta depende de `codEntityReference`. Ej.: si `codEntityReference`
   * es el producto de riesgo "mascota", este id es el `IdeRiskProduct`
   * puntual de "Perro".
   */
  @IsUUID()
  ideReference!: string;
}
