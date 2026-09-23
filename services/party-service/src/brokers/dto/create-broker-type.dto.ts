import { IsString, Matches } from 'class-validator';

export class CreateBrokerTypeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codBrokerType solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codBrokerType!: string;

  @IsString()
  desBrokerType!: string;
}
