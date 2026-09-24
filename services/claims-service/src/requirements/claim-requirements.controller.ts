import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { CurrentUser, JwtPayload } from '@ars-platform/shared-common';
import { ClaimRequirementsService } from './claim-requirements.service';
import { SetClaimRequirementReceivedDto } from './dto/set-claim-requirement-received.dto';

/** Ver el doc-comment de `ClaimRequirementsService`. */
@Controller('claim-files/:ideClaimFile/requirements')
export class ClaimRequirementsController {
  constructor(private readonly service: ClaimRequirementsService) {}

  @Get()
  list(@Param('ideClaimFile') ideClaimFile: string, @CurrentUser() actor: JwtPayload) {
    return this.service.listForClaimFile(ideClaimFile, actor.code);
  }

  @Patch(':ideClaimRequirement/received')
  setReceived(
    @Param('ideClaimRequirement') ideClaimRequirement: string,
    @Body() dto: SetClaimRequirementReceivedDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.setReceived(
      ideClaimRequirement,
      dto.tstReception ? new Date(dto.tstReception) : undefined,
      actor.code,
    );
  }
}
