import { IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';

export class UpdateDistributionChannelDto {
  @IsOptional()
  @IsString()
  desDistributionChannel?: string;

  @IsOptional()
  @IsString()
  image?: string;

  /** Pasar '' (string vacío) para desasociar el tipo de canal; omitir para no tocarlo. */
  @IsOptional()
  @IsString()
  codChannelType?: string;

  /** Pasar '' (string vacío) para desasociar el canal padre; omitir para no tocarlo. */
  @IsOptional()
  @IsString()
  codDistributionChannelParent?: string;

  /** Pasar '' (string vacío) para desasociar el broker; omitir para no tocarlo. */
  @IsOptional()
  @IsString()
  codBroker?: string;

  /** Pasar '' (string vacío) para desasociar la persona; omitir para no tocarla. */
  @IsOptional()
  @ValidateIf((o: { idePerson?: string }) => o.idePerson !== '')
  @IsUUID()
  idePerson?: string;
}
