import { IsJSON, IsString, Matches } from 'class-validator';

export class CreateAttributePropertyDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codAttributeProperty solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codAttributeProperty!: string;

  @IsString()
  desAttributeProperty!: string;

  /** CodModelAttribute del set de atributos al que pertenece este campo (debe existir). */
  @IsString()
  codModelAttribute!: string;

  /** CodAttribute del atributo reutilizable que representa este campo (debe existir). */
  @IsString()
  codAttribute!: string;

  /**
   * Schema real del campo de formulario, como string JSON -- confirmado
   * contra datos reales, ej.:
   * `{"name":"fechaCompra","label":"¿Cuando la compraste?","type":"date","validators":[{"validationName":"required"}],"validationMessages":{"required":"..."}}`.
   * Esta es la pieza que de verdad arma el formulario dinámico en el
   * frontend -- no `SAttribute.AttributeContent`, que es vestigial
   * (siempre `"{}"` en los datos reales).
   */
  @IsJSON()
  attributeContent!: string;
}
