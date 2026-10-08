import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { CollectiveTiersService } from './collective-tiers.service';
import { SaveCollectiveTiersDto } from './dto/save-collective-tiers.dto';

@Controller('collective-tiers')
export class CollectiveTiersController {
  constructor(private readonly service: CollectiveTiersService) {}

  @Get(':codProduct')
  findByProduct(@Param('codProduct') codProduct: string) {
    return this.service.findByProduct(codProduct);
  }

  @Roles('ADMIN')
  @Put(':codProduct')
  save(@Param('codProduct') codProduct: string, @Body() dto: SaveCollectiveTiersDto, @CurrentUser() actor: JwtPayload) {
    return this.service.save(codProduct, dto, actor.code);
  }
}
