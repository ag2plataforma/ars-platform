import { IsString, IsUUID, Matches } from 'class-validator';

export class CreateBrokerDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codBroker solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codBroker!: string;

  @IsString()
  desBroker!: string;

  /** Código de `SBrokerType` (catálogo de tipos de broker -- no tiene CRUD propio todavía, se asume ya sembrado). */
  @IsString()
  codBrokerType!: string;

  /** `TPerson` ya existente (no tiene código propio, se referencia por id -- ver `party-service`/`PersonsModule`). */
  @IsUUID()
  idePerson!: string;
}
