import { IsString, Matches } from 'class-validator';

export class CreateProcessFlowDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codProcessFlow solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codProcessFlow!: string;

  @IsString()
  desProcessFlow!: string;
}
