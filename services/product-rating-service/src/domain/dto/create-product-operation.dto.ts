import { IsString } from 'class-validator';

export class CreateProductOperationDto {
  @IsString()
  codProduct!: string;

  /** Operación del catálogo `SOperation` (CONTGENE, RECEGENE, RENOVGENE...). */
  @IsString()
  codOperation!: string;

  /** Proceso del catálogo `SProcess` bajo el que se configura la operación (CONTRATACION, RENOVACION...). */
  @IsString()
  codProcess!: string;
}

export class SetupBaseProductOperationsDto {
  @IsString()
  codProduct!: string;
}
