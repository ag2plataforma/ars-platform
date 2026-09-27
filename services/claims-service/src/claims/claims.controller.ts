import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { ClaimsService } from './claims.service';
import { DeclareClaimDto } from './dto/declare-claim.dto';
import { TransitionClaimFileDto } from './dto/transition-claim-file.dto';
import { UpdateInvoicedAmountDto } from './dto/update-invoiced-amount.dto';

/** Ver el doc-comment de `ClaimsService`. */
@Controller()
export class ClaimsController {
  constructor(private readonly service: ClaimsService) {}

  @Post('claims')
  declare(@Body() dto: DeclareClaimDto, @CurrentUser() actor: JwtPayload) {
    return this.service.declare(dto, actor.code);
  }

  @Get('claims')
  findAll(@Query('filterNumClaim') filterNumClaim?: string, @Query('codState') codState?: string) {
    return this.service.findAll(filterNumClaim, codState);
  }

  @Get('claims/:id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('CLAIMS_ADJUSTER', 'CLAIMS_MANAGER', 'CLAIMS_DIRECTOR', 'ADMIN')
  @Patch('claim-files/:id/state')
  transitionClaimFileState(
    @Param('id') id: string,
    @Body() dto: TransitionClaimFileDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.transitionClaimFileState(id, dto.codOperative, actor.code);
  }

  @Patch('coverage-provisions/:id/invoiced-amount')
  updateInvoicedAmount(
    @Param('id') id: string,
    @Body() dto: UpdateInvoicedAmountDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.updateInvoicedAmount(id, dto.invoicedAmount, actor.code);
  }
}
