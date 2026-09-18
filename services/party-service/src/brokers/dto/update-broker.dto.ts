import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateBrokerDto {
  @IsOptional()
  @IsString()
  desBroker?: string;

  @IsOptional()
  @IsString()
  codBrokerType?: string;

  @IsOptional()
  @IsUUID()
  idePerson?: string;
}
