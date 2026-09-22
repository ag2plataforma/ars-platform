import { IsOptional, IsString, IsUUID } from 'class-validator';

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

  @IsOptional()
  @IsUUID()
  idePerson?: string;
}
