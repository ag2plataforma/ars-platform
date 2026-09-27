import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { ApprovalsService } from './approvals.service';
import { GuaranteeProvisionsService } from './guarantee-provisions.service';
import { ClaimPaymentsService } from './claim-payments.service';
import { CreateApprovalDto } from './dto/create-approval.dto';
import { TransitionApprovalDetailDto } from './dto/transition-approval-detail.dto';
import { CreateGuaranteeProvisionDto } from './dto/create-guarantee-provision.dto';
import { CreateClaimPaymentDto } from './dto/create-claim-payment.dto';

const CLAIMS_ROLES = ['CLAIMS_ADJUSTER', 'CLAIMS_MANAGER', 'CLAIMS_DIRECTOR', 'ADMIN'];

/** Ver el doc-comment de `ApprovalsService`/`GuaranteeProvisionsService`/`ClaimPaymentsService`. */
@Controller()
export class ApprovalsController {
  constructor(
    private readonly approvals: ApprovalsService,
    private readonly guaranteeProvisions: GuaranteeProvisionsService,
    private readonly claimPayments: ClaimPaymentsService,
  ) {}

  @Roles(...CLAIMS_ROLES)
  @Post('claim-files/:id/approvals')
  createApproval(@Param('id') ideClaimFile: string, @Body() dto: CreateApprovalDto, @CurrentUser() actor: JwtPayload) {
    return this.approvals.createForClaimFile(ideClaimFile, dto, actor.code);
  }

  @Get('claim-files/:id/approvals')
  findApprovalsForClaimFile(@Param('id') ideClaimFile: string) {
    return this.approvals.findAllForClaimFile(ideClaimFile);
  }

  @Get('approvals/:id')
  findApproval(@Param('id') id: string) {
    return this.approvals.findOne(id);
  }

  @Roles(...CLAIMS_ROLES)
  @Patch('approval-details/:id/state')
  transitionDetail(@Param('id') id: string, @Body() dto: TransitionApprovalDetailDto, @CurrentUser() actor: JwtPayload) {
    return this.approvals.transitionDetail(id, dto, actor.code, actor.role);
  }

  @Roles(...CLAIMS_ROLES)
  @Post('coverage-provisions/:id/guarantee-provisions')
  createGuaranteeProvision(
    @Param('id') ideCoverageProvision: string,
    @Body() dto: CreateGuaranteeProvisionDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.guaranteeProvisions.createForCoverageProvision(ideCoverageProvision, dto, actor.code);
  }

  @Get('coverage-provisions/:id/guarantee-provisions')
  findGuaranteeProvisions(@Param('id') ideCoverageProvision: string) {
    return this.guaranteeProvisions.findAllForCoverageProvision(ideCoverageProvision);
  }

  @Roles(...CLAIMS_ROLES)
  @Post('approvals/:id/payments')
  createPayment(@Param('id') ideApproval: string, @Body() dto: CreateClaimPaymentDto, @CurrentUser() actor: JwtPayload) {
    return this.claimPayments.createForApproval(ideApproval, dto, actor.code);
  }

  @Get('approvals/:id/payments')
  findPayments(@Param('id') ideApproval: string) {
    return this.claimPayments.findAllForApproval(ideApproval);
  }
}
