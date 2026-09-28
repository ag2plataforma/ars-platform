import { Type } from 'class-transformer';
import { IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { ConditionDataDto } from './condition-data.dto';

export class CreateProductEndorsementDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codProductEndorsement solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codProductEndorsement!: string;

  @IsString()
  desProductEndorsement!: string;

  /** Producto al que aplica este endoso (obligatorio -- a diferencia de
   * `SCalculationRule`, acá no existe el comodín NULL: cada producto
   * configura sus propios endosos). */
  @IsString()
  codProduct!: string;

  /** Tipo de endoso (`SEndorsement`, ej. Anulación). */
  @IsString()
  codEndorsement!: string;

  /** Motivo puntual (`SEndorsementReason`, ej. "Solicitud del cliente"). */
  @IsString()
  codEndorsementReason!: string;

  /**
   * `SOperation`/`SProcess` de la operación que este endoso dispara al
   * ejecutarse -- crean/resuelven, en la misma transacción, la fila
   * `SOperationProduct` que `ContractsService.resolveOperationCodeByEndorsement`
   * necesita para encontrar este endoso al anular un contrato (join por
   * `IdeProductEndorsement`, distinto del que usan `CONTGENE`/`RECEGENE`).
   * Sin esto, el endoso quedaría configurado pero el backend fallaría
   * recién al intentar usarlo.
   */
  @IsString()
  codOperation!: string;

  @IsString()
  codProcess!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConditionDataDto)
  conditionData?: ConditionDataDto;
}
