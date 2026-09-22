import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { SocialImpactConfigService } from './social-impact-config.service';
import { CreateSocialImpactConfigDto } from './dto/create-social-impact-config.dto';
import { UpdateSocialImpactConfigDto } from './dto/update-social-impact-config.dto';
import { SetSocialImpactConfigStateDto } from './dto/set-social-impact-config-state.dto';

@Controller('social-impact-config')
export class SocialImpactConfigController {
  constructor(private readonly service: SocialImpactConfigService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateSocialImpactConfigDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSocialImpactConfigDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.update(id, dto, actor.code);
  }

  @Roles('ADMIN')
  @Patch(':id/state')
  setState(
    @Param('id') id: string,
    @Body() dto: SetSocialImpactConfigStateDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.setState(id, dto.codState, actor.code);
  }
}
