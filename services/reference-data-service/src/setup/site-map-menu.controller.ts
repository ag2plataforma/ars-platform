import { Controller, Get, Query } from '@nestjs/common';
import { SiteMapMenuService } from './site-map-menu.service';
import { GetSiteMapMenuDto } from './dto/get-site-map-menu.dto';

@Controller('site-map-menu')
export class SiteMapMenuController {
  constructor(private readonly service: SiteMapMenuService) {}

  @Get()
  getMenu(@Query() query: GetSiteMapMenuDto) {
    return this.service.getMenu(query.codApplicationRole);
  }
}
