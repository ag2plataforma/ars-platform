import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload } from '@ars-platform/shared-common';
import { ClaimsService } from './claims.service';
import { DeclareClaimDto } from './dto/declare-claim.dto';

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
}
