import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsNumber, IsOptional, Min, ValidateNested } from 'class-validator';

export class CollectiveTierDto {
  @IsInt()
  @Min(1)
  numFrom!: number;

  /** `null`/ausente = sin tope (solo el último tramo). */
  @IsOptional()
  @IsInt()
  @Min(1)
  numTo?: number | null;

  /** Prima total ANUAL por asegurado en este tramo. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amtPerInsured!: number;
}

export class SaveCollectiveTiersDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CollectiveTierDto)
  tiers!: CollectiveTierDto[];
}
