import { Controller, Get, Param, Query } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { ListReceiptsDto } from './dto/list-receipts.dto';

@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly service: ReceiptsService) {}

  @Get()
  findAll(@Query() query: ListReceiptsDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
