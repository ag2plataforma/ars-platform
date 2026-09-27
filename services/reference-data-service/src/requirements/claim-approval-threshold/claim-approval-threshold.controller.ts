import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { ClaimApprovalThresholdService } from './claim-approval-threshold.service';
import { CreateClaimApprovalThresholdDto } from './dto/create-claim-approval-threshold.dto';
import { UpdateClaimApprovalThresholdDto } from './dto/update-claim-approval-threshold.dto';
import { SetCatalogStateDto } from '../dto/set-catalog-state.dto';

@Controller('claim-approval-thresholds')
export class ClaimApprovalThresholdController {
  constructor(private readonly service: ClaimApprovalThresholdService) {}

  @Get()
  findAll(@Query('codProduct') codProduct?: string, @Query('codCurrency') codCurrency?: string) {
    return this.service.findAll(codProduct, codCurrency);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateClaimApprovalThresholdDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClaimApprovalThresholdDto, @CurrentUser() actor: JwtPayload) {
    return this.service.update(id, dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id/state')
  setState(@Param('id') id: string, @Body() dto: SetCatalogStateDto, @CurrentUser() actor: JwtPayload) {
    return this.service.setState(id, dto.codState, actor.code);
  }
}
