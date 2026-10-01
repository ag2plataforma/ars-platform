import { IsIn, IsUUID } from 'class-validator';
import { TEMPLATE_TYPES, TemplateType } from '../../templates/dto/create-template.dto';

export class GenerateContractDocumentDto {
  @IsIn([...TEMPLATE_TYPES])
  codTemplateType!: TemplateType;

  @IsUUID()
  idePersonRol!: string;
}
