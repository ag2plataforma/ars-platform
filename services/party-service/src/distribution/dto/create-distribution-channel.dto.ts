import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CreateDistributionChannelDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codDistributionChannel solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codDistributionChannel!: string;

  @IsString()
  desDistributionChannel!: string;

  @IsOptional()
  @IsString()
  image?: string;

  /** CodChannelType del tipo de canal (debe existir, si se envía). */
  @IsOptional()
  @IsString()
  codChannelType?: string;

  /** CodDistributionChannel del canal padre, para armar la jerarquía (opcional). */
  @IsOptional()
  @IsString()
  codDistributionChannelParent?: string;

  /** CodBroker del broker asociado a este canal (debe existir, si se envía). */
  @IsOptional()
  @IsString()
  codBroker?: string;

  /** `TPerson` ya existente asociada a este canal (no tiene código propio, se referencia por id). */
  @IsOptional()
  @IsUUID()
  idePerson?: string;
}
