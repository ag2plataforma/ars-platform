import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { RateFactorsService } from './rate-factors.service';
import { CreateRateFactorDto } from './dto/create-rate-factor.dto';
import { UpdateRateFactorDto } from './dto/update-rate-factor.dto';
import { ListRateFactorsDto } from './dto/list-rate-factors.dto';

@Controller('rate-factors')
export class RateFactorsController {
  constructor(private readonly service: RateFactorsService) {}

  @Get()
  findAll(@Query() query: ListRateFactorsDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateRateFactorDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRateFactorDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.update(id, dto, actor.code);
  }
}
